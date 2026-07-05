/**
 * Shared types for the multilang-calendar core engine.
 *
 * The engine is framework-agnostic and intentionally works on plain `Date`
 * instances (UTC-anchored internally) so it can be consumed from any
 * rendering layer (DOM, React, Vue, ...).
 */

/** Calendar systems supported via the Intl `calendar` option, plus the custom
 *  Amazigh (Berber) calendar which Intl does not provide natively. */
export type CalendarSystem =
  | 'gregory'
  | 'islamic'
  | 'islamic-umalqura'
  | 'islamic-civil'
  | 'islamic-tbla'
  | 'persian'
  | 'hebrew'
  | 'chinese'
  | 'buddhist'
  | 'amazigh';

/** Available view modes. */
export type ViewMode = 'month' | 'week' | 'day';

/** A locale dictionary — only the UI chrome strings. Month/weekday names are
 *  pulled from Intl, unless the dictionary overrides them (e.g. Tifinagh). */
export interface LocaleDictionary {
  /** BCP-47 tag, e.g. "en", "ar", "zgh". */
  readonly code: string;
  /** Optional human-readable display name for the language. */
  readonly name?: string;
  /** "Today" button label. */
  today: string;
  /** Tooltip / aria-label for the previous month button. */
  prevMonth: string;
  /** Tooltip / aria-label for the next month button. */
  nextMonth: string;
  /** Label prepended to ISO week numbers. */
  week: string;
  /** Title shown when a cell has events but none is hovered. */
  events: string;
  /** "No events" message. */
  noEvents: string;
  /** Optional override of long month names (12 entries, January-first). */
  months?: string[];
  /** Optional override of narrow weekday names (7 entries, Sunday-first). */
  weekdaysNarrow?: string[];
  /** Optional override of short weekday names (7 entries, Sunday-first). */
  weekdaysShort?: string[];
  /** View-switcher label for the month view. */
  month?: string;
  /** View-switcher label for the day view. */
  day?: string;
}

/** A single marker pinned to a Gregorian calendar day. */
export interface CalendarMarker {
  /** ISO date string `yyyy-mm-dd` (Gregorian). */
  date: string;
  /** Tooltip / list label for the marker. */
  label?: string;
  /** CSS color used for the dot / event block (any valid CSS color). */
  color?: string;
  /** Extra class added to the cell / event. */
  class?: string;
  /** Start time `HH:mm` (24h) for timed events in week/day views. */
  start?: string;
  /** End time `HH:mm` (24h). Defaults to `start` (zero-duration) if omitted. */
  end?: string;
}

/** A computed cell in the visible grid. */
export interface CalendarCell {
  /** UTC Date at midnight of this cell. */
  date: Date;
  /** Day-of-month in the active calendar system. */
  day: number;
  /** Month (1-12) in the active calendar system. */
  month: number;
  /** Year in the active calendar system. */
  year: number;
  /** Whether this cell belongs to the currently-viewed month. */
  inMonth: boolean;
  /** Whether this cell is today. */
  isToday: boolean;
  /** ISO week number (Gregorian). */
  weekNumber?: number;
  /** Markers matching this cell. */
  markers: CalendarMarker[];
  /** Whether selection is disabled (outside min/max). */
  disabled: boolean;
  /** Whether this cell falls in the current selection range. */
  inRange?: boolean;
  /** Whether this cell is the selected single date or range start/end. */
  selectedEdge?: 'start' | 'end' | 'single';
}

/** A week (7 cells), optionally prefixed with its week number. */
export interface CalendarWeek {
  weekNumber?: number;
  cells: CalendarCell[];
}

/** Selection model: a single date or an inclusive range. */
export type CalendarSelection =
  | { kind: 'single'; date: string }
  | { kind: 'range'; start: string; end: string | null }
  | null;

/** Engine options. */
export interface CalendarOptions {
  /** BCP-47 locale tag (e.g. "en", "ar-EG", "zgh"). Defaults to "en". */
  locale?: string;
  /** Calendar system. Defaults to "gregory". */
  calendar?: CalendarSystem;
  /** First day of the week (0=Sun..6=Sat). Auto from locale if omitted. */
  firstDayOfWeek?: number;
  /** Show ISO week numbers column. */
  weekNumbers?: boolean;
  /** Lower bound (inclusive), as ISO `yyyy-mm-dd`. */
  min?: string | null;
  /** Upper bound (inclusive), as ISO `yyyy-mm-dd`. */
  max?: string | null;
  /** Force text direction. Auto-detected from locale if omitted. */
  rtl?: boolean;
  /** Markers to render. */
  markers?: CalendarMarker[];
  /** Current selection. */
  selection?: CalendarSelection;
  /** Active view mode. Defaults to "month". */
  view?: ViewMode;
  /** First hour shown in week/day time-grids (0-23). Defaults to 0. */
  hourStart?: number;
  /** Last hour (exclusive) in week/day time-grids (1-24). Defaults to 24. */
  hourEnd?: number;
}

/** Immutable snapshot of what a view needs to render. */
export interface CalendarView {
  /** Active locale tag. */
  locale: string;
  /** Active calendar system. */
  calendar: CalendarSystem;
  /** Resolved first day of week. */
  firstDayOfWeek: number;
  /** Whether the view is right-to-left. */
  rtl: boolean;
  /** Whether the week-number column is shown. */
  weekNumbers: boolean;
  /** System year currently in view. */
  year: number;
  /** System month (1-12) currently in view. */
  month: number;
  /** Localized long month name. */
  monthName: string;
  /** System year formatted for display. */
  yearLabel: string;
  /** Localized weekday header labels (length 7, starting at firstDayOfWeek). */
  weekdays: { narrow: string; short: string }[];
  /** The grid: 6 weeks of 7 cells. */
  weeks: CalendarWeek[];
  /** Resolved dictionary (for chrome strings). */
  dictionary: LocaleDictionary;
}

/** A timed event laid out within a day column of a time-grid. */
export interface TimeGridEvent {
  /** The originating marker. */
  marker: CalendarMarker;
  /** Start offset in minutes from midnight. */
  startMin: number;
  /** End offset in minutes from midnight. */
  endMin: number;
  /** Column index within the event's overlap group (0-based). */
  column: number;
  /** Total columns in the event's overlap group (width divisor). */
  columns: number;
}

/** One day column in a week/day time-grid. */
export interface TimeGridDay {
  /** UTC Date at midnight of this day. */
  date: Date;
  /** ISO `yyyy-mm-dd`. */
  iso: string;
  /** Localized short weekday name (e.g. "Mon"). */
  dayName: string;
  /** Day-of-month in the active calendar system. */
  dayNumber: number;
  /** Localized short month name. */
  monthName: string;
  /** System year. */
  year: number;
  /** Whether this day is today. */
  isToday: boolean;
  /** Whether this day is in the anchor's month (week view only). */
  inMonth: boolean;
  /** Timed events positioned in the hour grid. */
  events: TimeGridEvent[];
  /** All-day markers (no `start` time) shown in the all-day row. */
  allDay: CalendarMarker[];
}

/** Immutable snapshot for a week or day time-grid view. */
export interface TimeGridView {
  /** Which time-grid mode. */
  mode: 'week' | 'day';
  /** Active locale tag. */
  locale: string;
  /** Active calendar system. */
  calendar: CalendarSystem;
  /** Whether the view is right-to-left. */
  rtl: boolean;
  /** Resolved first day of week (0=Sun..6=Sat). */
  firstDayOfWeek: number;
  /** First hour shown (inclusive). */
  hourStart: number;
  /** Last hour (exclusive). */
  hourEnd: number;
  /** Day columns (7 for week, 1 for day). */
  days: TimeGridDay[];
  /** Hour values down the side, e.g. [0,1,...,23]. */
  hours: number[];
  /** Localized hour labels aligned with `hours`. */
  hourLabels: string[];
  /** Human-readable range title. */
  title: string;
  /** Resolved dictionary (for chrome strings). */
  dictionary: LocaleDictionary;
}