/**
 * Web Component binding: `<intl-calendar>`.
 *
 * Renders the calendar into a Shadow DOM using the framework-agnostic engine.
 * Supports month, week, and day views. Configurable via attributes/properties,
 * emits `select`, `navigate`, and `viewchange` events.
 */
import '../locales'; // register built-in lazy loaders
import { CalendarEngine } from '../core/engine';
import { loadLocale, registerLocale } from '../core/locale';
import { fromISO, toISO } from '../core/dateUtils';
import type {
  CalendarMarker,
  CalendarSelection,
  CalendarSystem,
  CalendarView,
  LocaleDictionary,
  TimeGridView,
  ViewMode,
} from '../core/types';
import css from '../styles/calendar.css?inline';

const observed = [
  'locale',
  'calendar',
  'first-day',
  'week-numbers',
  'min',
  'max',
  'value',
  'markers',
  'view',
  'hour-start',
  'hour-end',
] as const;

const ARROW = { prev: '◀', next: '▶' };

export class IntlCalendar extends HTMLElement {
  static get observedAttributes() {
    return [...observed];
  }

  private engine: CalendarEngine = new CalendarEngine();
  private dict: LocaleDictionary | null = null;
  private anchor: Date = new Date(Date.UTC(2026, 6, 1));
  private monthView: CalendarView | null = null;
  private timeView: TimeGridView | null = null;
  private root: ShadowRoot;

  // reactive props
  locale = 'en';
  calendar: CalendarSystem = 'gregory';
  firstDay: number | null = null;
  weekNumbers = false;
  min: string | null = null;
  max: string | null = null;
  markers: CalendarMarker[] = [];
  selection: CalendarSelection = null;
  viewMode: ViewMode = 'month';
  hourStart: number | null = null;
  hourEnd: number | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    this.root.appendChild(style);
    this.hostEl = document.createElement('div');
    this.hostEl.className = 'mlc-calendar';
    this.root.appendChild(this.hostEl);
  }

  private hostEl: HTMLDivElement;

  connectedCallback() {
    // Read initial attributes (these do NOT fire attributeChangedCallback
    // when set before the element is upgraded).
    for (const name of observed) {
      const v = this.getAttribute(name);
      if (v != null) this.attributeChangedCallback(name, '', v);
    }
    this.refresh().catch((e) => this.renderError(e));
    this._ready = true;
  }

  private _ready = false;

  attributeChangedCallback(name: string, _old: string, value: string) {
    switch (name) {
      case 'locale':
        this.locale = value || 'en';
        this.engine = new CalendarEngine({
          locale: this.locale,
          calendar: this.calendar,
        });
        break;
      case 'calendar':
        this.calendar = (value as CalendarSystem) || 'gregory';
        this.engine = new CalendarEngine({
          locale: this.locale,
          calendar: this.calendar,
        });
        break;
      case 'first-day':
        this.firstDay = value === '' || value == null ? null : Number(value);
        break;
      case 'week-numbers':
        this.weekNumbers = value !== 'false' && value != null;
        break;
      case 'min':
        this.min = value || null;
        break;
      case 'max':
        this.max = value || null;
        break;
      case 'value': {
        if (!value) {
          this.selection = null;
        } else if (value.includes('|')) {
          const [s, e] = value.split('|');
          this.selection = { kind: 'range', start: s, end: e || null };
        } else {
          this.selection = { kind: 'single', date: value };
        }
        break;
      }
      case 'markers':
        try {
          this.markers = value ? (JSON.parse(value) as CalendarMarker[]) : [];
        } catch {
          this.markers = [];
        }
        break;
      case 'view':
        this.viewMode = (value as ViewMode) || 'month';
        break;
      case 'hour-start':
        this.hourStart = value === '' || value == null ? null : Number(value);
        break;
      case 'hour-end':
        this.hourEnd = value === '' || value == null ? null : Number(value);
        break;
    }
    if (this._ready) this.refresh().catch((e) => this.renderError(e));
  }

  /** Public API: navigate by N units of the current view. */
  async navigate(delta: number) {
    this.anchor = this.engine.advance(this.anchor, this.viewMode, delta);
    await this.refresh();
    this.emit('navigate', { anchor: toISO(this.anchor), view: this.viewMode });
  }

  /** Public API: jump to today. */
  async goToday() {
    this.anchor = new Date();
    await this.refresh();
    this.emit('navigate', { anchor: toISO(this.anchor), view: this.viewMode });
  }

  /** Public API: switch view mode. */
  async setView(mode: ViewMode) {
    this.viewMode = mode;
    await this.refresh();
    this.emit('viewchange', { view: mode });
  }

  private async refresh() {
    if (!this.dict || this.dict.code !== this.locale) {
      try {
        this.dict = await loadLocale(this.locale);
      } catch {
        this.dict = {
          code: this.locale,
          today: 'Today',
          prevMonth: 'Previous month',
          nextMonth: 'Next month',
          week: 'Week',
          events: 'Events',
          noEvents: 'No events',
        };
        registerLocale(this.dict);
      }
    }
    const opts = {
      firstDayOfWeek: this.firstDay ?? undefined,
      weekNumbers: this.weekNumbers,
      min: this.min,
      max: this.max,
      markers: this.markers,
      selection: this.selection,
    };
    if (this.viewMode === 'month') {
      this.monthView = this.engine.buildView(this.anchor, opts, this.dict);
      this.timeView = null;
    } else {
      this.timeView = this.engine.buildTimeGrid(
        this.anchor,
        this.viewMode,
        {
          ...opts,
          hourStart: this.hourStart ?? undefined,
          hourEnd: this.hourEnd ?? undefined,
        },
        this.dict,
      );
      this.monthView = null;
    }
    this.render();
  }

  private renderError(e: unknown) {
    this.hostEl.textContent = `Calendar error: ${
      e instanceof Error ? e.message : String(e)
    }`;
  }

  private render() {
    this.hostEl.dataset.rtl = String(
      (this.monthView ?? this.timeView)?.rtl ?? false,
    );
    this.hostEl.innerHTML = '';

    const dict = (this.monthView ?? this.timeView)!.dictionary;
    const titleText = this.monthView
      ? `${this.monthView.monthName} ${this.monthView.yearLabel}`
      : this.timeView!.title;

    const toolbar = document.createElement('div');
    toolbar.className = 'mlc-toolbar with-switch';

    const switcher = document.createElement('div');
    switcher.className = 'mlc-view-switch';
    const modes: ViewMode[] = ['month', 'week', 'day'];
    for (const m of modes) {
      const label =
        m === 'month'
          ? dict.month ?? 'Month'
          : m === 'week'
            ? dict.week
            : dict.day ?? 'Day';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mlc-view-btn';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(this.viewMode === m));
      b.addEventListener('click', () => this.setView(m));
      switcher.appendChild(b);
    }
    toolbar.appendChild(switcher);

    const title = document.createElement('div');
    title.className = 'mlc-title';
    title.textContent = titleText;
    toolbar.appendChild(title);

    const nav = document.createElement('div');
    nav.className = 'mlc-nav';
    const prev = this.btn(dict.prevMonth, ARROW.prev, () => this.navigate(-1));
    const today = this.btn(dict.today, dict.today, () => this.goToday());
    today.classList.add('mlc-today-btn');
    const next = this.btn(dict.nextMonth, ARROW.next, () => this.navigate(1));
    nav.append(prev, today, next);
    toolbar.appendChild(nav);
    this.hostEl.appendChild(toolbar);

    if (this.monthView) this.renderMonth(this.monthView);
    else if (this.timeView) this.renderTimeGrid(this.timeView);
  }

  private renderMonth(v: CalendarView) {
    const grid = document.createElement('div');
    grid.className = 'mlc-grid' + (v.weekNumbers ? ' with-weeks' : '');

    if (v.weekNumbers) grid.appendChild(span('mlc-weekday'));
    for (const wd of v.weekdays) {
      const h = span('mlc-weekday');
      h.textContent = wd.short;
      h.title = wd.narrow;
      grid.appendChild(h);
    }

    for (const week of v.weeks) {
      if (v.weekNumbers) {
        const wn = span('mlc-week-num');
        wn.textContent = String(week.weekNumber ?? '');
        wn.title = `${v.dictionary.week} ${week.weekNumber ?? ''}`;
        grid.appendChild(wn);
      }
      for (const cell of week.cells) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = cellClass(cell);
        el.textContent = String(cell.day);
        el.dataset.iso = toISO(cell.date);
        if (cell.isToday) el.title = v.dictionary.today;
        if (cell.markers.length) {
          const dots = document.createElement('span');
          dots.className = 'mlc-dots';
          for (const m of cell.markers.slice(0, 3)) {
            const d = document.createElement('span');
            d.className = 'mlc-dot' + (m.class ? ` ${m.class}` : '');
            if (m.color) d.style.background = m.color;
            dots.appendChild(d);
          }
          el.title = cell.markers
            .map((m) => m.label ?? v.dictionary.events)
            .join(', ');
          el.appendChild(dots);
        }
        if (cell.disabled) {
          el.setAttribute('aria-disabled', 'true');
        } else {
          el.addEventListener('click', () => this.onSelect(cell));
        }
        grid.appendChild(el);
      }
    }
    this.hostEl.appendChild(grid);
  }

  private renderTimeGrid(v: TimeGridView) {
    const wrap = document.createElement('div');
    wrap.className = 'mlc-tg';
    wrap.style.setProperty('--mlc-day-cols', String(v.days.length));
    wrap.style.setProperty('--mlc-tg-hours', String(v.hours.length));

    // Header row: corner + day heads.
    const head = document.createElement('div');
    head.className = 'mlc-tg-head';
    head.appendChild(span('mlc-tg-corner'));
    for (const d of v.days) {
      const h = document.createElement('div');
      h.className = 'mlc-tg-day-head' + (d.isToday ? ' mlc-tg-today' : '');
      const name = document.createElement('span');
      name.textContent = d.dayName;
      const num = document.createElement('span');
      num.className = 'mlc-tg-daynum';
      num.textContent = String(d.dayNumber);
      h.append(name, num);
      head.appendChild(h);
    }
    wrap.appendChild(head);

    // All-day row.
    const allday = document.createElement('div');
    allday.className = 'mlc-tg-allday';
    const al = document.createElement('div');
    al.className = 'mlc-tg-allday-label';
    al.textContent = '≅'; // generic all-day glyph
    allday.appendChild(al);
    for (const d of v.days) {
      const cell = document.createElement('div');
      cell.className = 'mlc-tg-allday-cell';
      for (const m of d.allDay) {
        const chip = document.createElement('span');
        chip.className = 'mlc-tg-all-day-chip' + (m.class ? ` ${m.class}` : '');
        if (m.color) chip.style.borderColor = m.color;
        chip.textContent = m.label ?? v.dictionary.events;
        chip.title = m.label ?? '';
        cell.appendChild(chip);
      }
      allday.appendChild(cell);
    }
    wrap.appendChild(allday);

    // Body: hour labels + day columns.
    const body = document.createElement('div');
    body.className = 'mlc-tg-body';

    const hoursCol = document.createElement('div');
    hoursCol.className = 'mlc-tg-hours';
    v.hourLabels.forEach((label) => {
      const hl = document.createElement('div');
      hl.className = 'mlc-tg-hour-label';
      hl.textContent = label;
      hoursCol.appendChild(hl);
    });
    body.appendChild(hoursCol);

    const cols = document.createElement('div');
    cols.className = 'mlc-tg-cols';
    for (const d of v.days) {
      const col = document.createElement('div');
      col.className = 'mlc-tg-day-col' + (d.isToday ? ' mlc-today-col' : '');
      for (const ev of d.events) {
        col.appendChild(this.eventEl(v, ev));
      }
      col.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('[data-iso]');
        if (!target) this.onSelect({ date: d.date, disabled: false });
      });
      cols.appendChild(col);
    }
    body.appendChild(cols);
    wrap.appendChild(body);
    this.hostEl.appendChild(wrap);
  }

  private eventEl(
    v: TimeGridView,
    ev: { marker: CalendarMarker; startMin: number; endMin: number; column: number; columns: number },
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mlc-event' + (ev.marker.class ? ` ${ev.marker.class}` : '');
    const startH = ev.startMin / 60 - v.hourStart;
    const durH = (ev.endMin - ev.startMin) / 60;
    el.style.top = `calc(${startH} * var(--mlc-hour-height))`;
    el.style.height = `calc(${durH} * var(--mlc-hour-height))`;
    const widthPct = 100 / ev.columns;
    el.style.width = `calc(${widthPct}% - 4px)`;
    el.style.left = `calc(${ev.column * widthPct}% + 2px)`;
    if (ev.marker.color) el.style.borderLeftColor = ev.marker.color;
    const title = document.createElement('span');
    title.className = 'mlc-event-title';
    title.textContent = ev.marker.label ?? v.dictionary.events;
    const time = document.createElement('span');
    time.className = 'mlc-event-time';
    time.textContent = `${fmtHHmm(ev.startMin)}–${fmtHHmm(ev.endMin)}`;
    el.append(title, time);
    el.title = `${ev.marker.label ?? ''} ${fmtHHmm(ev.startMin)}–${fmtHHmm(ev.endMin)}`.trim();
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('eventclick', {
        date: ev.marker.date,
        marker: ev.marker,
      });
    });
    return el;
  }

  private btn(label: string, text: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mlc-btn';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }

  private onSelect(cell: { date: Date; disabled: boolean }) {
    if (cell.disabled) return;
    const iso = toISO(cell.date);
    this.emit('select', { date: iso, raw: fromISO(iso) });
    if (!this.selection || this.selection.kind === 'single') {
      this.selection = { kind: 'single', date: iso };
      this.anchor = new Date(cell.date.getTime());
      this.refresh().catch(() => {});
    }
  }

  private emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

function span(cls: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  return s;
}

function fmtHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function cellClass(cell: {
  inMonth: boolean;
  isToday: boolean;
  disabled: boolean;
  inRange?: boolean;
  selectedEdge?: string;
}): string {
  const cls = ['mlc-cell'];
  if (!cell.inMonth) cls.push('mlc-out');
  if (cell.isToday) cls.push('mlc-today');
  if (cell.disabled) cls.push('mlc-disabled');
  if (cell.inRange) cls.push('mlc-in-range');
  if (cell.selectedEdge) cls.push('mlc-selected-edge', 'mlc-selected');
  return cls.join(' ');
}

declare global {
  interface HTMLElementTagNameMap {
    'intl-calendar': IntlCalendar;
  }
}

customElements.define('intl-calendar', IntlCalendar);
export default IntlCalendar;