/**
 * Vue 3 binding for multilang-calendar.
 *
 * Implemented with `defineComponent` + render functions (no SFC) so the
 * package needs no Vue template compiler at runtime. Supports month, week,
 * and day views.
 */
import { defineComponent, h, onMounted, ref, shallowRef, watch } from 'vue';
import '../locales'; // register built-in lazy loaders
import { CalendarEngine } from '../core/engine';
import { loadLocale } from '../core/locale';
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

function fmtHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const Calendar = defineComponent({
  name: 'MultilangCalendar',
  props: {
    locale: { type: String, default: 'en' },
    calendar: { type: String as () => CalendarSystem, default: 'gregory' },
    firstDayOfWeek: { type: Number, default: null },
    weekNumbers: { type: Boolean, default: false },
    min: { type: String, default: null },
    max: { type: String, default: null },
    rtl: { type: Boolean, default: null },
    markers: { type: Array as () => CalendarMarker[], default: () => [] },
    selection: { type: [Object, null] as unknown as () => CalendarSelection, default: null },
    value: { type: String, default: null },
    view: { type: String as () => ViewMode, default: 'month' },
    hourStart: { type: Number, default: null },
    hourEnd: { type: Number, default: null },
  },
  emits: ['select', 'navigate', 'viewchange', 'eventclick'],
  setup(props, { emit, expose }) {
    const dict = shallowRef<LocaleDictionary | null>(null);
    const anchor = ref<Date>(new Date(Date.UTC(2026, 6, 1)));
    const monthView = shallowRef<CalendarView | null>(null);
    const timeView = shallowRef<TimeGridView | null>(null);

    const engineRef = shallowRef(
      new CalendarEngine({ locale: props.locale, calendar: props.calendar }),
    );
    watch(
      () => [props.locale, props.calendar],
      () => {
        engineRef.value = new CalendarEngine({
          locale: props.locale,
          calendar: props.calendar,
        });
      },
    );

    onMounted(async () => {
      await load();
    });
    watch(
      () => props.locale,
      async () => {
        await load();
      },
    );

    async function load() {
      try {
        dict.value = await loadLocale(props.locale);
      } catch {
        dict.value = {
          code: props.locale,
          today: 'Today',
          prevMonth: 'Previous month',
          nextMonth: 'Next month',
          week: 'Week',
          events: 'Events',
          noEvents: 'No events',
        };
      }
    }

    const effectiveSelection = (): CalendarSelection => {
      if (props.value !== null && props.value !== undefined) {
        return props.value ? { kind: 'single', date: props.value } : null;
      }
      return props.selection;
    };

    watch(
      () => props.value,
      (v) => {
        if (v) anchor.value = fromISO(v);
      },
    );

    watch(
      [engineRef, dict, anchor, () => props],
      () => {
        if (!dict.value) {
          monthView.value = null;
          timeView.value = null;
          return;
        }
        const opts = {
          firstDayOfWeek: props.firstDayOfWeek ?? undefined,
          weekNumbers: props.weekNumbers,
          min: props.min,
          max: props.max,
          rtl: props.rtl ?? undefined,
          markers: props.markers,
          selection: effectiveSelection(),
        };
        if (props.view === 'month') {
          monthView.value = engineRef.value.buildView(anchor.value, opts, dict.value);
          timeView.value = null;
        } else {
          timeView.value = engineRef.value.buildTimeGrid(
            anchor.value,
            props.view,
            { ...opts, hourStart: props.hourStart ?? undefined, hourEnd: props.hourEnd ?? undefined },
            dict.value,
          );
          monthView.value = null;
        }
      },
      { deep: true, immediate: true },
    );

    function nav(delta: number) {
      anchor.value = engineRef.value.advance(anchor.value, props.view, delta);
      emit('navigate', toISO(anchor.value), props.view);
    }
    function goToday() {
      anchor.value = new Date();
      emit('navigate', toISO(anchor.value), props.view);
    }
    function select(iso: string) {
      emit('select', iso);
      const sel = effectiveSelection();
      if (!sel || sel.kind === 'single') anchor.value = fromISO(iso);
    }
    function changeView(m: ViewMode) {
      emit('viewchange', m);
    }
    function eventClick(m: CalendarMarker) {
      emit('eventclick', m);
    }

    expose({ nav, goToday, select });

    const cellClass = (c: CalendarView['weeks'][number]['cells'][number]) =>
      [
        'mlc-cell',
        !c.inMonth && 'mlc-out',
        c.isToday && 'mlc-today',
        c.disabled && 'mlc-disabled',
        c.inRange && 'mlc-in-range',
        c.selectedEdge && 'mlc-selected-edge',
        c.selectedEdge && 'mlc-selected',
      ]
        .filter(Boolean)
        .join(' ');

    return () => {
      const v = monthView.value ?? timeView.value;
      if (!v) return h('div', { class: 'mlc-calendar', 'aria-busy': true });

      const dict0 = v.dictionary;
      const title = monthView.value
        ? `${monthView.value.monthName} ${monthView.value.yearLabel}`
        : timeView.value!.title;
      const rtl = v.rtl;

      const modes: ViewMode[] = ['month', 'week', 'day'];
      const switcher = h(
        'div',
        { class: 'mlc-view-switch' },
        modes.map((m) => {
          const label =
            m === 'month' ? dict0.month ?? 'Month'
              : m === 'week' ? dict0.week
              : dict0.day ?? 'Day';
          return h(
            'button',
            {
              type: 'button',
              class: 'mlc-view-btn',
              'aria-pressed': props.view === m,
              onClick: () => changeView(m),
            },
            label,
          );
        }),
      );

      const navBtns = h('div', { class: 'mlc-nav' }, [
        h('button', {
          type: 'button', class: 'mlc-btn',
          title: dict0.prevMonth, 'aria-label': dict0.prevMonth,
          onClick: () => nav(-1),
        }, '◀'),
        h('button', {
          type: 'button', class: 'mlc-btn mlc-today-btn',
          title: dict0.today, onClick: goToday,
        }, dict0.today),
        h('button', {
          type: 'button', class: 'mlc-btn',
          title: dict0.nextMonth, 'aria-label': dict0.nextMonth,
          onClick: () => nav(1),
        }, '▶'),
      ]);

      const toolbar = h('div', { class: 'mlc-toolbar with-switch' }, [
        switcher,
        h('div', { class: 'mlc-title' }, title),
        navBtns,
      ]);

      let body: ReturnType<typeof h>;
      if (monthView.value) {
        body = renderMonth(monthView.value, cellClass, select);
      } else {
        body = renderTimeGrid(timeView.value!, select, eventClick);
      }

      return h('div', { class: 'mlc-calendar', 'data-rtl': rtl, dir: rtl ? 'rtl' : 'ltr' }, [toolbar, body]);
    };
  },
});

function renderMonth(
  v: CalendarView,
  cellClass: (c: CalendarView['weeks'][number]['cells'][number]) => string,
  select: (iso: string) => void,
): ReturnType<typeof h> {
  const gridChildren: ReturnType<typeof h>[] = [];
  if (v.weekNumbers) gridChildren.push(h('span', { class: 'mlc-weekday' }));
  v.weekdays.forEach((wd) =>
    gridChildren.push(h('span', { class: 'mlc-weekday', title: wd.narrow }, wd.short)),
  );
  v.weeks.forEach((week) => {
    if (v.weekNumbers)
      gridChildren.push(
        h('span', {
          class: 'mlc-week-num',
          title: `${v.dictionary.week} ${week.weekNumber ?? ''}`,
        }, String(week.weekNumber ?? '')),
      );
    week.cells.forEach((c) => {
      const iso = toISO(c.date);
      const dots = c.markers.length
        ? h('span', { class: 'mlc-dots' },
            c.markers.slice(0, 3).map((m, i) =>
              h('span', {
                key: i,
                class: `mlc-dot${m.class ? ' ' + m.class : ''}`,
                style: m.color ? { background: m.color } : undefined,
              }),
            ),
          )
        : null;
      gridChildren.push(
        h('button', {
          key: iso,
          type: 'button',
          class: cellClass(c),
          'data-iso': iso,
          title: c.markers.length
            ? c.markers.map((m) => m.label ?? v.dictionary.events).join(', ')
            : c.isToday ? v.dictionary.today : '',
          disabled: c.disabled,
          onClick: () => !c.disabled && select(iso),
        }, [String(c.day), dots]),
      );
    });
  });
  return h('div', { class: `mlc-grid${v.weekNumbers ? ' with-weeks' : ''}` }, gridChildren);
}

function renderTimeGrid(
  v: TimeGridView,
  select: (iso: string) => void,
  eventClick: (m: CalendarMarker) => void,
): ReturnType<typeof h> {
  const headChildren: ReturnType<typeof h>[] = [h('div', { class: 'mlc-tg-corner' })];
  v.days.forEach((d) =>
    headChildren.push(
      h('div', { class: `mlc-tg-day-head${d.isToday ? ' mlc-tg-today' : ''}` }, [
        h('span', d.dayName),
        h('span', { class: 'mlc-tg-daynum' }, String(d.dayNumber)),
      ]),
    ),
  );

  const alldayChildren: ReturnType<typeof h>[] = [h('div', { class: 'mlc-tg-allday-label' }, '≅')];
  v.days.forEach((d) =>
    alldayChildren.push(
      h('div', { class: 'mlc-tg-allday-cell' },
        d.allDay.map((m, i) =>
          h('span', {
            key: i,
            class: `mlc-tg-all-day-chip${m.class ? ' ' + m.class : ''}`,
            style: m.color ? { borderColor: m.color } : undefined,
            title: m.label ?? '',
          }, m.label ?? v.dictionary.events),
        ),
      ),
    ),
  );

  const hoursCol = h('div', { class: 'mlc-tg-hours' },
    v.hourLabels.map((label, i) =>
      h('div', { key: i, class: 'mlc-tg-hour-label' }, label),
    ),
  );

  const cols = h('div', { class: 'mlc-tg-cols' },
    v.days.map((d) =>
      h('div', {
        key: d.iso,
        class: `mlc-tg-day-col${d.isToday ? ' mlc-today-col' : ''}`,
        onClick: () => select(d.iso),
      },
        d.events.map((ev, i) => {
          const startH = ev.startMin / 60 - v.hourStart;
          const durH = (ev.endMin - ev.startMin) / 60;
          const widthPct = 100 / ev.columns;
          return h('div', {
            key: i,
            class: `mlc-event${ev.marker.class ? ' ' + ev.marker.class : ''}`,
            style: {
              top: `calc(${startH} * var(--mlc-hour-height))`,
              height: `calc(${durH} * var(--mlc-hour-height))`,
              width: `calc(${widthPct}% - 4px)`,
              left: `calc(${ev.column * widthPct}% + 2px)`,
              borderLeftColor: ev.marker.color,
            },
            title: `${ev.marker.label ?? ''} ${fmtHHmm(ev.startMin)}–${fmtHHmm(ev.endMin)}`.trim(),
            onClick: (e: Event) => {
              e.stopPropagation();
              eventClick(ev.marker);
            },
          }, [
            h('span', { class: 'mlc-event-title' }, ev.marker.label ?? v.dictionary.events),
            h('span', { class: 'mlc-event-time' }, `${fmtHHmm(ev.startMin)}–${fmtHHmm(ev.endMin)}`),
          ]);
        }),
      ),
    ),
  );

  return h('div', {
    class: 'mlc-tg',
    style: {
      '--mlc-day-cols': String(v.days.length),
      '--mlc-tg-hours': String(v.hours.length),
    },
  }, [
    h('div', { class: 'mlc-tg-head' }, headChildren),
    h('div', { class: 'mlc-tg-allday' }, alldayChildren),
    h('div', { class: 'mlc-tg-body' }, [hoursCol, cols]),
  ]);
}

export default Calendar;