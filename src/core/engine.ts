/**
 * The calendar engine. Pure, framework-agnostic logic that produces an
 * immutable {@link CalendarView} snapshot from a set of options.
 *
 * Design notes:
 *  - All dates are anchored to UTC midnight to stay timezone-stable.
 *  - Day/month/year *display* numbers come from `Intl.DateTimeFormat` using
 *    the chosen `calendar` system, so Hijri, Persian, Hebrew, etc. "just work"
 *    without shipping date-conversion tables.
 *  - Converting (systemYear, systemMonth, day=1) back to a Gregorian Date is
 *    done by scanning a bounded window of days and matching Intl parts. This
 *    is generic over any calendar system Intl supports.
 */
import {
  addDays,
  fromISO,
  isoWeek,
  startOfWeek,
  toISO,
  todayISO,
} from './dateUtils';
import { firstDayOfWeekFor, isRTL, resolveLocale } from './locale';
import type {
  CalendarCell,
  CalendarMarker,
  CalendarOptions,
  CalendarSystem,
  CalendarView,
  CalendarWeek,
  LocaleDictionary,
  TimeGridDay,
  TimeGridEvent,
  TimeGridView,
} from './types';

/** Rough offset between a calendar-system year and the Gregorian year. Used
 *  only to seed the conversion scan window — exactness is not required. */
const OFFSET_HINT: Record<CalendarSystem, number> = {
  gregory: 0,
  islamic: 579,
  'islamic-umalqura': 579,
  'islamic-civil': 579,
  'islamic-tbla': 579,
  persian: 621,
  hebrew: -3760,
  chinese: 0,
  buddhist: -543,
  // Amazigh is a Gregorian-structured calendar; the year offset (+950) is
  // applied only to the *displayed* year label, never to the grid math, so the
  // conversion scan is bypassed entirely (see fromCalendarParts).
  amazigh: 0,
};

/** Day of January on which the Amazigh new year (Yennayer) falls, per the
 *  Moroccan official convention. Dates Jan 1..13 belong to the previous
 *  Amazigh year; Jan 14 onward begins the new one. */
const YENNAYER_DAY = 14;

/** Amazigh year for a Gregorian Date, applying the Yennayer (Jan 14) roll. */
function amazighYearOf(date: Date): number {
  let ay = date.getUTCFullYear() + 950;
  if (date.getUTCMonth() === 0 && date.getUTCDate() < YENNAYER_DAY) ay -= 1;
  return ay;
}

/** Displayed Amazigh year label, e.g. "2976 ⴰⵎ (2026)". The era marker is
 *  Tifinagh for the Tamazight locale and Latin "AM" elsewhere. */
function amazighYearSuffix(date: Date, locale: string): string {
  const era = locale.toLowerCase().startsWith('zgh') ? 'ⴰⵎ' : 'AM';
  return `${amazighYearOf(date)} ${era} (${date.getUTCFullYear()})`;
}

interface Parts {
  year: number;
  month: number; // 1-based
  day: number;
  weekday: number; // 0=Sun..6=Sat (Gregorian, which matches weekday identity)
}

const PART_TYPES = new Set(['year', 'month', 'day', 'weekday']);

/** A small, cached pool of Intl formatters keyed by locale|calendar|era. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string,
  calendar: CalendarSystem,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  // Intl has no Berber calendar; the Amazigh system shares Gregorian
  // structure, so every Intl call is made with the proleptic Gregorian
  // calendar. Month/weekday names still come from the locale (or the zgh
  // dictionary override), and the year is rewritten for display.
  const intlCalendar = calendar === 'amazigh' ? 'gregory' : calendar;
  const key = `${locale}|${intlCalendar}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, calendar: intlCalendar, timeZone: 'UTC' });
    formatterCache.set(key, f);
  }
  return f;
}

/** Extract numeric year/month/day (and Gregorian weekday) from a Date.
 *  Uses the Latin numbering system so values are always ASCII digits
 *  (Arabic-Indic, Persian, etc. would otherwise make `parseInt` return NaN). */
function partsOf(date: Date, locale: string, calendar: CalendarSystem): Parts {
  // The Amazigh calendar shares the Gregorian grid, so its day/month/year
  // *parts* are the Gregorian ones (the Amazigh year is only a display label).
  if (calendar === 'amazigh') return partsOf(date, locale, 'gregory');
  const fmt = getFormatter(locale, calendar, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    numberingSystem: 'latn',
  });
  const out: Partial<Parts> = { weekday: date.getUTCDay() };
  for (const p of fmt.formatToParts(date)) {
    if (!PART_TYPES.has(p.type)) continue;
    const n = parseInt(p.value, 10);
    if (Number.isNaN(n)) {
      // Some calendars use era suffixes on years; Intl still emits the
      // numeric part as a separate 'literal'-ish chunk in modern engines.
      continue;
    }
    if (p.type === 'year') out.year = n;
    else if (p.type === 'month') out.month = n;
    else if (p.type === 'day') out.day = n;
  }
  return {
    year: out.year ?? date.getUTCFullYear(),
    month: out.month ?? date.getUTCMonth() + 1,
    day: out.day ?? date.getUTCDate(),
    weekday: out.weekday ?? 0,
  };
}

/**
 * Convert (year, month, day=1) in the given calendar system to a UTC Date by
 * scanning a bounded Gregorian window and matching Intl parts.
 */
function fromCalendarParts(
  locale: string,
  calendar: CalendarSystem,
  year: number,
  month: number,
  day = 1,
): Date {
  // Amazigh parts are Gregorian, so the inverse is a direct construction —
  // no Intl scan needed (which would also throw, since Intl has no Berber
  // calendar).
  if (calendar === 'amazigh') {
    return new Date(Date.UTC(year, month - 1, Math.min(28, Math.max(1, day))));
  }
  const offset = OFFSET_HINT[calendar] ?? 0;
  const estGYear = year + offset;
  let cursor = new Date(Date.UTC(estGYear - 1, 0, 1));
  const end = new Date(Date.UTC(estGYear + 2, 0, 1));
  while (cursor <= end) {
    const p = partsOf(cursor, locale, calendar);
    if (p.year === year && p.month === month && p.day === day) return cursor;
    cursor = addDays(cursor, 1);
  }
  // Fall back to the month start, then nudge to the requested day.
  cursor = new Date(Date.UTC(estGYear - 1, 0, 1));
  while (cursor <= end) {
    const p = partsOf(cursor, locale, calendar);
    if (p.year === year && p.month === month && p.day === 1) {
      return addDays(cursor, Math.max(0, day - 1));
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error(
    `[multilang-calendar] Could not resolve ${calendar} date ${year}-${month}-${day}.`,
  );
}

/**
 * Add (or subtract) a number of months in the calendar system, returning a
 * new UTC Date pointing at the first of the resulting system month.
 */
export function addSystemMonth(
  date: Date,
  delta: number,
  locale: string,
  calendar: CalendarSystem,
): Date {
  const p = partsOf(date, locale, calendar);
  let total = p.year * 12 + (p.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return fromCalendarParts(locale, calendar, year, month, 1);
}

/** Localized long month name, preferring a dictionary override. Pass the
 *  anchor date so Intl formats the real (era-safe) date instead of a synthetic
 *  year-1 sample, which is ambiguous in proleptic Gregorian/Hebrew calendars. */
function monthName(
  month1: number,
  anchor: Date,
  locale: string,
  calendar: CalendarSystem,
  dict?: LocaleDictionary,
): string {
  if (dict?.months) return dict.months[month1 - 1];
  return getFormatter(locale, calendar, { month: 'long' }).format(anchor);
}

/** Localized year label (handles era suffixes like AH) from the anchor date.
 *  The Amazigh calendar shows the Amazigh year plus the Gregorian year, e.g.
 *  "2976 ⴰⵎ (2026)". */
function yearLabel(
  anchor: Date,
  locale: string,
  calendar: CalendarSystem,
): string {
  if (calendar === 'amazigh') return amazighYearSuffix(anchor, locale);
  return getFormatter(locale, calendar, { year: 'numeric' }).format(anchor);
}

/** Weekday header labels (narrow + short), rotated to firstDayOfWeek. */
function weekdayHeaders(
  locale: string,
  calendar: CalendarSystem,
  firstDayOfWeek: number,
  dict?: LocaleDictionary,
): { narrow: string; short: string }[] {
  const narrow: string[] = [];
  const short: string[] = [];
  for (let i = 0; i < 7; i++) {
    // 2023-01-01 was a Sunday → deterministic sample dates per weekday.
    const sample = new Date(Date.UTC(2023, 0, 1 + i));
    if (dict?.weekdaysNarrow) narrow.push(dict.weekdaysNarrow[i]);
    else
      narrow.push(
        getFormatter(locale, calendar, { weekday: 'narrow' }).format(sample),
      );
    if (dict?.weekdaysShort) short.push(dict.weekdaysShort[i]);
    else
      short.push(
        getFormatter(locale, calendar, { weekday: 'short' }).format(sample),
      );
  }
  // Rotate so the array starts at firstDayOfWeek.
  const rotate = <T,>(arr: T[]): T[] =>
    [...arr.slice(firstDayOfWeek), ...arr.slice(0, firstDayOfWeek)];
  return rotate(narrow).map((n, i) => ({ narrow: n, short: rotate(short)[i] }));
}

/** Parse an `HH:mm` (or ISO datetime) time string to minutes from midnight. */
function parseTime(value: string | undefined): number {
  if (!value) return -1;
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Lay out overlapping events into columns. Mutates `events` in place. */
function layoutEvents(events: TimeGridEvent[]): void {
  events.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  // Greedy column assignment.
  const colEnds: number[] = [];
  for (const ev of events) {
    let col = -1;
    for (let i = 0; i < colEnds.length; i++) {
      if (colEnds[i] <= ev.startMin) {
        col = i;
        break;
      }
    }
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(ev.endMin);
    } else {
      colEnds[col] = ev.endMin;
    }
    ev.column = col;
  }
  // For each event, the width divisor is the number of columns used by the
  // maximal set of events overlapping it (its connected overlap group).
  const overlaps = (a: TimeGridEvent, b: TimeGridEvent) =>
    a.startMin < b.endMin && b.startMin < a.endMin;
  for (const ev of events) {
    let cols = 1;
    for (const other of events) {
      if (overlaps(ev, other)) cols = Math.max(cols, other.column + 1);
    }
    ev.columns = cols;
  }
}

/** Localized short weekday name for a single date (dictionary override aware). */
function weekdayShortFor(
  date: Date,
  locale: string,
  calendar: CalendarSystem,
  dict?: LocaleDictionary,
): string {
  if (dict?.weekdaysShort) return dict.weekdaysShort[date.getUTCDay()];
  return getFormatter(locale, calendar, { weekday: 'short' }).format(date);
}

/** Localized short month name via the anchor date. */
function monthShort(
  date: Date,
  locale: string,
  calendar: CalendarSystem,
  dict?: LocaleDictionary,
): string {
  const p = partsOf(date, locale, calendar);
  if (dict?.months) return dict.months[p.month - 1];
  return getFormatter(locale, calendar, { month: 'short' }).format(date);
}

/** Localized hour label, e.g. "1 AM" or "01". */
function hourLabel(hour: number, locale: string, calendar: CalendarSystem): string {
  const sample = new Date(Date.UTC(2026, 0, 1, hour, 0));
  return getFormatter(locale, calendar, { hour: 'numeric' }).format(sample);
}

/** Full localized day title, e.g. "Monday, July 6, 2026". The Amazigh calendar
 *  appends the Amazigh year + Gregorian year suffix. */
function dayTitle(
  date: Date,
  locale: string,
  calendar: CalendarSystem,
  dict?: LocaleDictionary,
): string {
  if (calendar === 'amazigh') {
    const p = partsOf(date, locale, calendar);
    const weekday = getFormatter(locale, calendar, { weekday: 'long' }).format(date);
    const month = monthName(p.month, date, locale, calendar, dict);
    return `${weekday}, ${month} ${p.day} ${amazighYearSuffix(date, locale)}`;
  }
  return getFormatter(locale, calendar, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Localized week range title, e.g. "Jul 6 – Jul 12, 2026". The Amazigh
 *  calendar uses dictionary month names and an Amazigh-year suffix (which may
 *  differ across the range when the week straddles Yennayer). */
function weekTitle(
  start: Date,
  end: Date,
  locale: string,
  calendar: CalendarSystem,
  dict?: LocaleDictionary,
): string {
  if (calendar === 'amazigh') {
    const era = locale.toLowerCase().startsWith('zgh') ? 'ⴰⵎ' : 'AM';
    const fmtMD = (d: Date) => {
      const p = partsOf(d, locale, calendar);
      return `${monthShort(d, locale, calendar, dict)} ${p.day}`;
    };
    const sa = amazighYearOf(start);
    const ea = amazighYearOf(end);
    const gyS = start.getUTCFullYear();
    const gyE = end.getUTCFullYear();
    const suffix =
      sa === ea
        ? `${sa} ${era} (${gyS})`
        : `${sa} ${era} (${gyS}) – ${ea} ${era} (${gyE})`;
    return `${fmtMD(start)} – ${fmtMD(end)}, ${suffix}`;
  }
  const fmtMD = (d: Date) =>
    getFormatter(locale, calendar, { month: 'short', day: 'numeric' }).format(d);
  const fmtY = (d: Date) =>
    getFormatter(locale, calendar, { year: 'numeric' }).format(d);
  const sp = partsOf(start, locale, calendar);
  const ep = partsOf(end, locale, calendar);
  if (sp.year === ep.year) return `${fmtMD(start)} – ${fmtMD(end)}, ${fmtY(start)}`;
  return `${fmtMD(start)}, ${fmtY(start)} – ${fmtMD(end)}, ${fmtY(end)}`;
}

/** Core engine class. Cheap to construct; holds resolved locale + calendar. */
export class CalendarEngine {
  readonly locale: string;
  readonly calendar: CalendarSystem;

  constructor(options: Pick<CalendarOptions, 'locale' | 'calendar'> = {}) {
    this.locale = resolveLocale(options.locale);
    this.calendar = options.calendar ?? 'gregory';
  }

  /** Convert a Gregorian Date to system parts. */
  parts(date: Date): Parts {
    return partsOf(date, this.locale, this.calendar);
  }

  /** Find the first day of a system month/year. */
  firstOfMonth(year: number, month: number): Date {
    return fromCalendarParts(this.locale, this.calendar, year, month, 1);
  }

  /** Move an anchor date by `delta` system months. */
  addMonth(date: Date, delta: number): Date {
    return addSystemMonth(date, delta, this.locale, this.calendar);
  }

  /**
   * Build a full view snapshot for the given anchor (a Date anywhere in the
   * target month) and resolved dictionary.
   */
  buildView(
    anchor: Date,
    options: Omit<CalendarOptions, 'locale' | 'calendar'>,
    dictionary: LocaleDictionary,
  ): CalendarView {
    const firstDayOfWeek =
      options.firstDayOfWeek ?? firstDayOfWeekFor(this.locale);
    const rtl = options.rtl ?? isRTL(this.locale);
    const weekNumbers = options.weekNumbers ?? false;
    const markers = options.markers ?? [];
    const today = todayISO();
    const min = options.min ?? null;
    const max = options.max ?? null;

    const anchorParts = this.parts(anchor);
    const monthStart = this.firstOfMonth(anchorParts.year, anchorParts.month);

    // Grid start: walk back to the first day-of-week on/before monthStart.
    const startWeekday = monthStart.getUTCDay();
    const lead = (startWeekday - firstDayOfWeek + 7) % 7;
    const gridStart = addDays(monthStart, -lead);

    const headers = weekdayHeaders(
      this.locale,
      this.calendar,
      firstDayOfWeek,
      dictionary,
    );

    const byDate = new Map<string, CalendarMarker[]>();
    for (const m of markers) {
      const arr = byDate.get(m.date) ?? [];
      arr.push(m);
      byDate.set(m.date, arr);
    }

    const sel = options.selection ?? null;
    const selStart = sel && (sel.kind === 'single' ? sel.date : sel.start);
    const selEnd = sel && sel.kind === 'range' ? sel.end : null;
    const selSingle = sel?.kind === 'single' ? sel.date : null;

    const weeks: CalendarWeek[] = [];
    let cursor = gridStart;
    for (let w = 0; w < 6; w++) {
      const cells: CalendarCell[] = [];
      const weekNum = weekNumbers ? isoWeek(cursor) : undefined;
      for (let d = 0; d < 7; d++) {
        const iso = toISO(cursor);
        const p = this.parts(cursor);
        const cellMarkers = byDate.get(iso) ?? [];
        const disabled =
          (min !== null && iso < min) || (max !== null && iso > max);
        const inRange =
          selStart !== null && selEnd !== null
            ? iso >= (selStart < selEnd ? selStart : selEnd) &&
              iso <= (selStart < selEnd ? selEnd : selStart)
            : false;
        const selectedEdge: CalendarCell['selectedEdge'] = selSingle
          ? iso === selSingle
            ? 'single'
            : undefined
          : selStart !== null && selEnd !== null
            ? iso === selStart
              ? 'start'
              : iso === selEnd
                ? 'end'
                : undefined
            : iso === selStart
              ? 'start'
              : undefined;
        cells.push({
          date: new Date(cursor.getTime()),
          day: p.day,
          month: p.month,
          year: p.year,
          inMonth: p.year === anchorParts.year && p.month === anchorParts.month,
          isToday: iso === today,
          weekNumber: weekNum,
          markers: cellMarkers,
          disabled,
          inRange,
          selectedEdge,
        });
        cursor = addDays(cursor, 1);
      }
      weeks.push({ weekNumber: weekNum, cells });
    }

    return {
      locale: this.locale,
      calendar: this.calendar,
      firstDayOfWeek,
      rtl,
      weekNumbers,
      year: anchorParts.year,
      month: anchorParts.month,
      monthName: monthName(
        anchorParts.month,
        monthStart,
        this.locale,
        this.calendar,
        dictionary,
      ),
      yearLabel: yearLabel(monthStart, this.locale, this.calendar),
      weekdays: headers,
      weeks,
      dictionary,
    };
  }

  /** Move an anchor by `delta` units appropriate to the view mode:
   *  months (month), weeks (week), or days (day). */
  advance(anchor: Date, mode: 'month' | 'week' | 'day', delta: number): Date {
    if (mode === 'month') return this.addMonth(anchor, delta);
    return addDays(anchor, delta * (mode === 'week' ? 7 : 1));
  }

  /**
   * Build a week or day time-grid snapshot. Timed markers (with `start`) are
   * laid out as positioned event blocks; untimed markers become all-day chips.
   */
  buildTimeGrid(
    anchor: Date,
    mode: 'week' | 'day',
    options: Omit<CalendarOptions, 'locale' | 'calendar' | 'view'>,
    dictionary: LocaleDictionary,
  ): TimeGridView {
    const firstDayOfWeek =
      options.firstDayOfWeek ?? firstDayOfWeekFor(this.locale);
    const rtl = options.rtl ?? isRTL(this.locale);
    const hourStart = clampHour(options.hourStart ?? 0);
    const hourEnd = Math.max(hourStart + 1, clampHour(options.hourEnd ?? 24));
    const markers = options.markers ?? [];
    const today = todayISO();

    const byDate = new Map<string, CalendarMarker[]>();
    for (const m of markers) {
      const arr = byDate.get(m.date) ?? [];
      arr.push(m);
      byDate.set(m.date, arr);
    }

    const numDays = mode === 'week' ? 7 : 1;
    const start =
      mode === 'week' ? startOfWeek(anchor, firstDayOfWeek) : anchor;
    const anchorParts = this.parts(anchor);

    const days: TimeGridDay[] = [];
    for (let i = 0; i < numDays; i++) {
      const date = addDays(start, i);
      const iso = toISO(date);
      const p = this.parts(date);
      const dayMarkers = byDate.get(iso) ?? [];

      const events: TimeGridEvent[] = [];
      const allDay: CalendarMarker[] = [];
      for (const m of dayMarkers) {
        const startMin = parseTime(m.start);
        if (startMin < 0) {
          allDay.push(m);
          continue;
        }
        let endMin = parseTime(m.end);
        if (endMin < 0 || endMin <= startMin) endMin = startMin + 30;
        events.push({ marker: m, startMin, endMin, column: 0, columns: 1 });
      }
      layoutEvents(events);

      days.push({
        date,
        iso,
        dayName: weekdayShortFor(date, this.locale, this.calendar, dictionary),
        dayNumber: p.day,
        monthName: monthShort(date, this.locale, this.calendar, dictionary),
        year: p.year,
        isToday: iso === today,
        inMonth: p.year === anchorParts.year && p.month === anchorParts.month,
        events,
        allDay,
      });
    }

    const hours: number[] = [];
    for (let h = hourStart; h < hourEnd; h++) hours.push(h);
    const hourLabels = hours.map((h) =>
      hourLabel(h, this.locale, this.calendar),
    );

    const end = addDays(start, numDays - 1);
    const title =
      mode === 'day'
        ? dayTitle(start, this.locale, this.calendar, dictionary)
        : weekTitle(start, end, this.locale, this.calendar, dictionary);

    return {
      mode,
      locale: this.locale,
      calendar: this.calendar,
      rtl,
      firstDayOfWeek,
      hourStart,
      hourEnd,
      days,
      hours,
      hourLabels,
      title,
      dictionary,
    };
  }
}

/** Clamp an hour value to 0-24. */
function clampHour(h: number): number {
  return Math.max(0, Math.min(24, Math.round(h)));
}

/** Convenience: parse an ISO string with the engine's UTC semantics. */
export const parseISO = fromISO;