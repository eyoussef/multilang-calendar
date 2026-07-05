/**
 * React binding for multilang-calendar.
 *
 * Wraps the framework-agnostic engine in a controlled component supporting
 * month, week, and day views. The locale dictionary is loaded asynchronously;
 * the component renders a lightweight placeholder until it resolves.
 */
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import '../locales'; // register built-in lazy loaders
import { CalendarEngine } from '../core/engine';
import { loadLocale } from '../core/locale';
import { fromISO, toISO } from '../core/dateUtils';
import type {
  CalendarMarker,
  CalendarOptions,
  CalendarSelection,
  CalendarSystem,
  CalendarView,
  LocaleDictionary,
  TimeGridEvent,
  TimeGridView,
  ViewMode,
} from '../core/types';

export interface ReactCalendarProps
  extends Omit<
    CalendarOptions,
    'locale' | 'selection' | 'markers' | 'calendar' | 'view'
  > {
  locale?: string;
  calendar?: CalendarSystem;
  markers?: CalendarMarker[];
  selection?: CalendarSelection;
  /** Active view mode. */
  view?: ViewMode;
  /** Default view when uncontrolled. */
  defaultView?: ViewMode;
  /** Controlled selected ISO date (single) — convenience over `selection`. */
  value?: string | null;
  /** Fired when the user clicks an enabled cell. */
  onSelect?: (iso: string) => void;
  /** Fired on prev/next/today navigation. */
  onNavigate?: (anchorIso: string, view: ViewMode) => void;
  /** Fired when the view mode changes. */
  onViewChange?: (view: ViewMode) => void;
  /** Fired when a timed event block is clicked. */
  onEventClick?: (marker: CalendarMarker) => void;
  className?: string;
}

const PLACEHOLDER = new Date(Date.UTC(2026, 6, 1));

export function Calendar(props: ReactCalendarProps): ReactElement {
  const {
    locale = 'en',
    calendar = 'gregory',
    firstDayOfWeek,
    weekNumbers = false,
    min = null,
    max = null,
    rtl,
    markers = [],
    selection = null,
    view,
    defaultView = 'month',
    value,
    onSelect,
    onNavigate,
    onViewChange,
    onEventClick,
    className,
  } = props;

  const engine = useMemo(
    () => new CalendarEngine({ locale, calendar }),
    [locale, calendar],
  );

  const [dict, setDict] = useState<LocaleDictionary | null>(null);
  const [anchor, setAnchor] = useState<Date>(PLACEHOLDER);
  const [viewState, setViewState] = useState<ViewMode>(view ?? defaultView);
  const currentView = view ?? viewState;

  useEffect(() => {
    let cancelled = false;
    loadLocale(locale)
      .then((d) => !cancelled && setDict(d))
      .catch(
        () =>
          !cancelled &&
          setDict({
            code: locale,
            today: 'Today',
            prevMonth: 'Previous month',
            nextMonth: 'Next month',
            week: 'Week',
            events: 'Events',
            noEvents: 'No events',
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const effectiveSelection: CalendarSelection = useMemo(() => {
    if (value !== undefined) {
      return value ? { kind: 'single', date: value } : null;
    }
    return selection;
  }, [value, selection]);

  useEffect(() => {
    if (effectiveSelection?.kind === 'single') {
      setAnchor(fromISO(effectiveSelection.date));
    }
  }, [effectiveSelection]);

  const monthView = useMemo<CalendarView | null>(() => {
    if (!dict || currentView !== 'month') return null;
    return engine.buildView(
      anchor,
      {
        firstDayOfWeek,
        weekNumbers,
        min,
        max,
        rtl,
        markers,
        selection: effectiveSelection,
      },
      dict,
    );
  }, [
    engine, dict, anchor, currentView, firstDayOfWeek, weekNumbers,
    min, max, rtl, markers, effectiveSelection,
  ]);

  const timeView = useMemo<TimeGridView | null>(() => {
    if (!dict || currentView === 'month') return null;
    return engine.buildTimeGrid(
      anchor,
      currentView,
      {
        firstDayOfWeek, weekNumbers, min, max, rtl, markers,
        selection: effectiveSelection,
        hourStart: props.hourStart,
        hourEnd: props.hourEnd,
      },
      dict,
    );
  }, [
    engine, dict, anchor, currentView, firstDayOfWeek, weekNumbers,
    min, max, rtl, markers, effectiveSelection, props.hourStart, props.hourEnd,
  ]);

  const nav = (delta: number) => {
    const next = engine.advance(anchor, currentView, delta);
    setAnchor(next);
    onNavigate?.(toISO(next), currentView);
  };
  const goToday = () => {
    const t = new Date();
    setAnchor(t);
    onNavigate?.(toISO(t), currentView);
  };
  const select = (iso: string) => {
    onSelect?.(iso);
    if (!effectiveSelection || effectiveSelection.kind === 'single') {
      setAnchor(fromISO(iso));
    }
  };
  const changeView = (m: ViewMode) => {
    if (view === undefined) setViewState(m);
    onViewChange?.(m);
  };

  const active = monthView ?? timeView;
  if (!active) {
    return (
      <div className={`mlc-calendar ${className ?? ''}`} aria-busy="true" />
    );
  }

  const dict0 = active.dictionary;
  const title = monthView
    ? `${monthView.monthName} ${monthView.yearLabel}`
    : timeView!.title;

  const modes: ViewMode[] = ['month', 'week', 'day'];

  return (
    <div
      className={`mlc-calendar ${className ?? ''}`}
      data-rtl={active.rtl}
      dir={active.rtl ? 'rtl' : 'ltr'}
    >
      <div className="mlc-toolbar with-switch">
        <div className="mlc-view-switch">
          {modes.map((m) => {
            const label =
              m === 'month' ? dict0.month ?? 'Month'
                : m === 'week' ? dict0.week
                : dict0.day ?? 'Day';
            return (
              <button
                key={m}
                type="button"
                className="mlc-view-btn"
                aria-pressed={currentView === m}
                onClick={() => changeView(m)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mlc-title">{title}</div>
        <div className="mlc-nav">
          <button type="button" className="mlc-btn" title={dict0.prevMonth} aria-label={dict0.prevMonth} onClick={() => nav(-1)}>◀</button>
          <button type="button" className="mlc-btn mlc-today-btn" title={dict0.today} onClick={goToday}>{dict0.today}</button>
          <button type="button" className="mlc-btn" title={dict0.nextMonth} aria-label={dict0.nextMonth} onClick={() => nav(1)}>▶</button>
        </div>
      </div>

      {monthView && <MonthGrid view={monthView} onSelect={select} />}
      {timeView && (
        <TimeGrid view={timeView} onSelect={select} onEventClick={onEventClick} />
      )}
    </div>
  );
}

function MonthGrid({
  view: v,
  onSelect,
}: {
  view: CalendarView;
  onSelect: (iso: string) => void;
}) {
  return (
    <div className={`mlc-grid${v.weekNumbers ? ' with-weeks' : ''}`}>
      {v.weekNumbers && <span className="mlc-weekday" />}
      {v.weekdays.map((wd, i) => (
        <span key={i} className="mlc-weekday" title={wd.narrow}>
          {wd.short}
        </span>
      ))}
      {v.weeks.map((week, wi) => (
        <Fragment key={wi}>
          {v.weekNumbers && (
            <span className="mlc-week-num" title={`${v.dictionary.week} ${week.weekNumber ?? ''}`}>
              {week.weekNumber ?? ''}
            </span>
          )}
          {week.cells.map((c) => {
            const cls = [
              'mlc-cell',
              !c.inMonth && 'mlc-out',
              c.isToday && 'mlc-today',
              c.disabled && 'mlc-disabled',
              c.inRange && 'mlc-in-range',
              c.selectedEdge && 'mlc-selected-edge',
              c.selectedEdge && 'mlc-selected',
            ].filter(Boolean).join(' ');
            const iso = toISO(c.date);
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                data-iso={iso}
                title={
                  c.markers.length
                    ? c.markers.map((m) => m.label ?? v.dictionary.events).join(', ')
                    : c.isToday ? v.dictionary.today : ''
                }
                disabled={c.disabled}
                onClick={() => !c.disabled && onSelect(iso)}
              >
                {c.day}
                {c.markers.length > 0 && (
                  <span className="mlc-dots">
                    {c.markers.slice(0, 3).map((m, i) => (
                      <span
                        key={i}
                        className={`mlc-dot${m.class ? ' ' + m.class : ''}`}
                        style={m.color ? { background: m.color } : undefined}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function TimeGrid({
  view: v,
  onSelect,
  onEventClick,
}: {
  view: TimeGridView;
  onSelect: (iso: string) => void;
  onEventClick?: (marker: CalendarMarker) => void;
}) {
  return (
    <div
      className="mlc-tg"
      style={
        {
          '--mlc-day-cols': v.days.length,
          '--mlc-tg-hours': v.hours.length,
        } as CSSProperties
      }
    >
      <div className="mlc-tg-head">
        <div className="mlc-tg-corner" />
        {v.days.map((d) => (
          <div
            key={d.iso}
            className={`mlc-tg-day-head${d.isToday ? ' mlc-tg-today' : ''}`}
          >
            <span>{d.dayName}</span>
            <span className="mlc-tg-daynum">{d.dayNumber}</span>
          </div>
        ))}
      </div>

      <div className="mlc-tg-allday">
        <div className="mlc-tg-allday-label">≅</div>
        {v.days.map((d) => (
          <div key={d.iso} className="mlc-tg-allday-cell">
            {d.allDay.map((m, i) => (
              <span
                key={i}
                className={`mlc-tg-all-day-chip${m.class ? ' ' + m.class : ''}`}
                style={m.color ? { borderColor: m.color } : undefined}
                title={m.label ?? ''}
              >
                {m.label ?? v.dictionary.events}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="mlc-tg-body">
        <div className="mlc-tg-hours">
          {v.hourLabels.map((label, i) => (
            <div key={i} className="mlc-tg-hour-label">
              {label}
            </div>
          ))}
        </div>
        <div className="mlc-tg-cols">
          {v.days.map((d) => (
            <div
              key={d.iso}
              className={`mlc-tg-day-col${d.isToday ? ' mlc-today-col' : ''}`}
              onClick={() => onSelect(d.iso)}
            >
              {d.events.map((ev, i) => (
                <EventBlock
                  key={i}
                  view={v}
                  ev={ev}
                  onClick={onEventClick}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  view: v,
  ev,
  onClick,
}: {
  view: TimeGridView;
  ev: TimeGridEvent;
  onClick?: (marker: CalendarMarker) => void;
}) {
  const startH = ev.startMin / 60 - v.hourStart;
  const durH = (ev.endMin - ev.startMin) / 60;
  const widthPct = 100 / ev.columns;
  return (
    <div
      className={`mlc-event${ev.marker.class ? ' ' + ev.marker.class : ''}`}
      style={{
        top: `calc(${startH} * var(--mlc-hour-height))`,
        height: `calc(${durH} * var(--mlc-hour-height))`,
        width: `calc(${widthPct}% - 4px)`,
        left: `calc(${ev.column * widthPct}% + 2px)`,
        borderLeftColor: ev.marker.color,
      }}
      title={`${ev.marker.label ?? ''} ${fmtHHmm(ev.startMin)}–${fmtHHmm(ev.endMin)}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(ev.marker);
      }}
    >
      <span className="mlc-event-title">{ev.marker.label ?? v.dictionary.events}</span>
      <span className="mlc-event-time">
        {fmtHHmm(ev.startMin)}–{fmtHHmm(ev.endMin)}
      </span>
    </div>
  );
}

function fmtHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default Calendar;