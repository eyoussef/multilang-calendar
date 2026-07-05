// Runtime smoke test for the built package. Validates the tricky parts:
// Intl parts parsing (Latin digits), Hijri navigation, and Tamazight dict.
import {
  CalendarEngine,
  loadLocale,
  availableLocales,
  isRTL,
  firstDayOfWeekFor,
  toISO,
} from './dist/index.js';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL- ${name} ${extra}`);
  }
}

console.log('availableLocales:', availableLocales.join(', '));
check('has zgh', availableLocales.includes('zgh'));
check('has ar', availableLocales.includes('ar'));

// English / Gregorian
{
  const eng = new CalendarEngine({ locale: 'en', calendar: 'gregory' });
  const dict = await loadLocale('en');
  const view = eng.buildView(new Date(Date.UTC(2026, 6, 4)), { weekNumbers: true }, dict);
  check('en gregory month is July', view.month === 7, `got ${view.month}`);
  check('en gregory year 2026', view.year === 2026, `got ${view.year}`);
  check('en monthName July', /july/i.test(view.monthName), `got ${view.monthName}`);
  check('en has 6 weeks', view.weeks.length === 6);
  const todayCell = view.weeks.flatMap((w) => w.cells).find((c) => c.isToday);
  check('en today cell exists', !!todayCell);
  check('en weekNumbers on view', view.weekNumbers === true);
  // first cell day number should be <= 7 or a trailing day
  check('en first weekday header is 2 chars-ish', view.weekdays.length === 7);
  check('en firstDayOfWeek 0 (Sun)', view.firstDayOfWeek === 0, `got ${view.firstDayOfWeek}`);
  check('en first weekday header is Sunday', /^sun/i.test(view.weekdays[0].short), `got ${view.weekdays[0].short}`);
}

// Arabic / Hijri (Umm al-Qura) — the case that broke parseInt before latn fix.
{
  const ar = new CalendarEngine({ locale: 'ar', calendar: 'islamic-umalqura' });
  const dict = await loadLocale('ar');
  // 2026-07-04 gregorian is around 1 Muharram 1448 AH.
  const view = ar.buildView(new Date(Date.UTC(2026, 6, 4)), {}, dict);
  check('ar hijri month is 1 (Muharram)', view.month === 1, `got ${view.month}`);
  check('ar hijri year is 1448', view.year === 1448, `got ${view.year}`);
  check('ar monthName contains Arabic', /[؀-ۿ]/.test(view.monthName), `got ${view.monthName}`);
  // Navigate forward one Hijri month → month 2.
  const next = ar.addMonth(new Date(Date.UTC(2026, 6, 4)), 1);
  const nv = ar.buildView(next, {}, dict);
  check('ar hijri next month is 2', nv.month === 2, `got ${nv.month}`);
  check('ar hijri next year still 1448', nv.year === 1448, `got ${nv.year}`);
  // Navigate forward 11 months → should roll year.
  const far = ar.addMonth(new Date(Date.UTC(2026, 6, 4)), 12);
  const fv = ar.buildView(far, {}, dict);
  check('ar hijri +12 months rolls year to 1449', fv.year === 1449, `got ${fv.year}`);
  check('ar hijri +12 months month is 1', fv.month === 1, `got ${fv.month}`);
}

// Tamazight / Tifinagh (zgh) — Gregorian with dictionary month/weekday overrides.
{
  const zgh = new CalendarEngine({ locale: 'zgh', calendar: 'gregory' });
  const dict = await loadLocale('zgh');
  const view = zgh.buildView(new Date(Date.UTC(2026, 6, 4)), { weekNumbers: true }, dict);
  check('zgh gregory month 7', view.month === 7, `got ${view.month}`);
  check('zgh monthName uses Tifinagh', /[ⴰ-⵿]/.test(view.monthName), `got ${view.monthName}`);
  check('zgh July is ⵢⵓⵍⵢⵓⵣ', view.monthName === 'ⵢⵓⵍⵢⵓⵣ', `got ${view.monthName}`);
  check('zgh weekdays Tifinagh', /[ⴰ-⵿]/.test(view.weekdays[0].short), `got ${view.weekdays[0].short}`);
  check('zgh weekday shorts fit (<=3 chars)', view.weekdays.every((w) => w.short.length <= 3), `got ${view.weekdays.map((w) => w.short).join('|')}`);
  check('zgh weekday shorts distinct', new Set(view.weekdays.map((w) => w.short)).size === 7, `got ${view.weekdays.map((w) => w.short).join('|')}`);
  check('zgh today label Tifinagh', /[ⴰ-⵿]/.test(dict.today), `got ${dict.today}`);
  check('zgh is NOT rtl', isRTL('zgh') === false);
}

// RTL + first day
check('ar is rtl', isRTL('ar') === true);
check('en is ltr', isRTL('en') === false);
check('en first day 0 (Sun)', firstDayOfWeekFor('en') === 0);
check('fr first day 1 (Mon)', firstDayOfWeekFor('fr') === 1);

// Selection range
{
  const eng = new CalendarEngine({ locale: 'en', calendar: 'gregory' });
  const dict = await loadLocale('en');
  const view = eng.buildView(
    new Date(Date.UTC(2026, 6, 4)),
    { selection: { kind: 'range', start: '2026-07-04', end: '2026-07-10' } },
    dict,
  );
  const cells = view.weeks.flatMap((w) => w.cells);
  const start = cells.find((c) => toISO(c.date) === '2026-07-04');
  const mid = cells.find((c) => toISO(c.date) === '2026-07-07');
  const end = cells.find((c) => toISO(c.date) === '2026-07-10');
  check('range start edge', start?.selectedEdge === 'start');
  check('range middle inRange', mid?.inRange === true);
  check('range end edge', end?.selectedEdge === 'end');
}

// Markers + min/max
{
  const eng = new CalendarEngine({ locale: 'en', calendar: 'gregory' });
  const dict = await loadLocale('en');
  const view = eng.buildView(
    new Date(Date.UTC(2026, 6, 4)),
    {
      min: '2026-07-03',
      max: '2026-07-20',
      markers: [
        { date: '2026-07-14', label: 'Review', color: '#dc2626' },
        { date: '2026-07-04', label: 'Today', color: '#16a34a' },
      ],
    },
    dict,
  );
  const cells = view.weeks.flatMap((w) => w.cells);
  const before = cells.find((c) => toISO(c.date) === '2026-07-02');
  const after = cells.find((c) => toISO(c.date) === '2026-07-21');
  const marked = cells.find((c) => toISO(c.date) === '2026-07-14');
  check('min disabled before', before?.disabled === true);
  check('max disabled after', after?.disabled === true);
  check('marker attached', marked?.markers.length === 1);
}

// Week view (time-grid)
{
  const eng = new CalendarEngine({ locale: 'en', calendar: 'gregory' });
  const dict = await loadLocale('en');
  const tg = eng.buildTimeGrid(
    new Date(Date.UTC(2026, 6, 8)), // Wed Jul 8 2026
    'week',
    {
      markers: [
        { date: '2026-07-06', label: 'Standup', start: '09:00', end: '09:30', color: '#2563eb' },
        { date: '2026-07-06', label: 'Sprint planning', start: '09:15', end: '10:30' }, // overlaps standup
        { date: '2026-07-06', label: 'Lunch', start: '12:00', end: '13:00' },
        { date: '2026-07-08', label: 'All day off', color: '#16a34a' }, // all-day
        { date: '2026-07-09', label: 'Demo', start: '14:00', end: '15:00' },
      ],
    },
    dict,
  );
  check('week mode', tg.mode === 'week');
  check('week has 7 days', tg.days.length === 7);
  check('week starts on Sunday (en)', toISO(tg.days[0].date) === '2026-07-05', `got ${toISO(tg.days[0].date)}`);
  check('week 24 hours', tg.hours.length === 24);
  check('week hour 0 label', tg.hourLabels.length === 24);
  const mon = tg.days.find((d) => d.iso === '2026-07-06');
  check('week mon has 3 timed events', mon?.events.length === 3, `got ${mon?.events.length}`);
  check('week mon has 0 all-day', mon?.allDay.length === 0);
  const standup = mon?.events.find((e) => e.marker.label === 'Standup');
  check('standup startMin 540', standup?.startMin === 540, `got ${standup?.startMin}`);
  check('standup endMin 570', standup?.endMin === 570, `got ${standup?.endMin}`);
  // Standup (9:00-9:30) and Sprint planning (9:15-10:30) overlap → 2 columns.
  check('overlap group 2 columns', standup?.columns === 2, `got ${standup?.columns}`);
  check('standup column 0', standup?.column === 0);
  const lunch = mon?.events.find((e) => e.marker.label === 'Lunch');
  check('lunch 1 column (no overlap)', lunch?.columns === 1);
  const wed = tg.days.find((d) => d.iso === '2026-07-08');
  check('wed has 1 all-day', wed?.allDay.length === 1);
  check('week title contains 2026', /2026/.test(tg.title), `got ${tg.title}`);
}

// Day view + navigation
{
  const eng = new CalendarEngine({ locale: 'en', calendar: 'gregory' });
  const dict = await loadLocale('en');
  const tg = eng.buildTimeGrid(
    new Date(Date.UTC(2026, 6, 9)),
    'day',
    { markers: [{ date: '2026-07-09', label: 'Demo', start: '14:00', end: '15:00' }] },
    dict,
  );
  check('day mode', tg.mode === 'day');
  check('day has 1 day', tg.days.length === 1);
  check('day event present', tg.days[0].events.length === 1);
  check('day title weekday Thursday', /Thursday/.test(tg.title), `got ${tg.title}`);

  // advance: +1 day in day view, +1 week in week view, +1 month in month view.
  const a = new Date(Date.UTC(2026, 6, 9));
  check('advance day +1', toISO(eng.advance(a, 'day', 1)) === '2026-07-10');
  check('advance day -1', toISO(eng.advance(a, 'day', -1)) === '2026-07-08');
  check('advance week +1', toISO(eng.advance(a, 'week', 1)) === '2026-07-16');
  check('advance month +1 (Aug)', eng.addMonth(a, 1).getUTCMonth() === 7);
}

// Custom hour range (working hours)
{
  const eng = new CalendarEngine({ locale: 'fr', calendar: 'gregory' });
  const dict = await loadLocale('fr');
  const tg = eng.buildTimeGrid(
    new Date(Date.UTC(2026, 6, 9)),
    'day',
    { hourStart: 6, hourEnd: 22, markers: [] },
    dict,
  );
  check('fr custom hours 6..21', tg.hours.length === 16 && tg.hours[0] === 6 && tg.hours[15] === 21);
  check('fr hour label localized', tg.hourLabels.length === 16);
  check('fr rtl false', tg.rtl === false);
}

// Arabic week view (RTL + Hijri day numbers)
{
  const ar = new CalendarEngine({ locale: 'ar', calendar: 'islamic-umalqura' });
  const dict = await loadLocale('ar');
  const tg = ar.buildTimeGrid(new Date(Date.UTC(2026, 6, 8)), 'week', {}, dict);
  check('ar week rtl', tg.rtl === true);
  check('ar week 7 days', tg.days.length === 7);
  check('ar day name Arabic', /[؀-ۿ]/.test(tg.days[0].dayName), `got ${tg.days[0].dayName}`);
  check('ar day view-month switch labels', dict.month === 'شهر' && dict.day === 'يوم');
}

// Amazigh (Berber) calendar — Gregorian grid + Tifinagh names + Amazigh year
// (Gregorian + 950, rolling on Yennayer = Jan 14 per the Moroccan convention).
{
  const am = new CalendarEngine({ locale: 'zgh', calendar: 'amazigh' });
  const dict = await loadLocale('zgh');

  // Parts are Gregorian (the grid is Gregorian).
  const p = am.parts(new Date(Date.UTC(2026, 6, 4)));
  check('amazigh parts gregorian year 2026', p.year === 2026, `got ${p.year}`);
  check('amazigh parts month 7', p.month === 7, `got ${p.month}`);
  check('amazigh parts day 4', p.day === 4, `got ${p.day}`);

  // Year label shows Amazigh year + Gregorian year with the Tifinagh era.
  const view = am.buildView(new Date(Date.UTC(2026, 6, 4)), { weekNumbers: true }, dict);
  check('amazigh July monthName Tifinagh ⵢⵓⵍⵢⵓⵣ', view.monthName === 'ⵢⵓⵍⵢⵓⵣ', `got ${view.monthName}`);
  check('amazigh yearLabel "2976 ⴰⵎ (2026)"', view.yearLabel === '2976 ⴰⵎ (2026)', `got ${view.yearLabel}`);
  check('amazigh grid gregorian year 2026', view.year === 2026, `got ${view.year}`);
  check('amazigh grid gregorian month 7', view.month === 7, `got ${view.month}`);

  // Yennayer boundary (Jan 14): the month-view label uses the month's first
  // day, so January 2026 (starting Jan 1, pre-Yennayer) is labeled 2975.
  const jan1 = am.buildView(new Date(Date.UTC(2026, 0, 1)), {}, dict);
  check('amazigh Jan 2026 month label is 2975 (month begins pre-Yennayer)', jan1.yearLabel === '2975 ⴰⵎ (2026)', `got ${jan1.yearLabel}`);
  const jan14 = am.buildView(new Date(Date.UTC(2026, 0, 14)), {}, dict);
  check('amazigh Jan 2026 month label stable at 2975 even when anchored on Yennayer', jan14.yearLabel === '2975 ⴰⵎ (2026)', `got ${jan14.yearLabel}`);
  check('amazigh Dec 2025 label is 2975', am.buildView(new Date(Date.UTC(2025, 11, 31)), {}, dict).yearLabel === '2975 ⴰⵎ (2025)');

  // The roll DOES apply to specific dates: day-view titles use the actual day.
  const yennayer = am.buildTimeGrid(new Date(Date.UTC(2026, 0, 14)), 'day', {}, dict);
  check('amazigh Jan 14 day title is 2976 (Yennayer roll)', yennayer.title.includes('2976'), `got ${yennayer.title}`);
  const preYennayer = am.buildTimeGrid(new Date(Date.UTC(2026, 0, 13)), 'day', {}, dict);
  check('amazigh Jan 13 day title is 2975 (pre-Yennayer)', preYennayer.title.includes('2975') && !preYennayer.title.includes('2976'), `got ${preYennayer.title}`);

  // Navigation moves by Gregorian month and keeps Tifinagh names.
  const aug = am.addMonth(new Date(Date.UTC(2026, 6, 4)), 1);
  const augView = am.buildView(aug, {}, dict);
  check('amazigh +1 month → August (ⵖⵓⵛⵜ)', augView.monthName === 'ⵖⵓⵛⵜ', `got ${augView.monthName}`);
  check('amazigh +1 month year label 2976', augView.yearLabel === '2976 ⴰⵎ (2026)', `got ${augView.yearLabel}`);

  // Day & week titles carry the Amazigh year suffix.
  const dayView = am.buildTimeGrid(new Date(Date.UTC(2026, 6, 4)), 'day', {}, dict);
  check('amazigh day title has ⴰⵎ', dayView.title.includes('ⴰⵎ'), `got ${dayView.title}`);
  check('amazigh day title has 2976', dayView.title.includes('2976'), `got ${dayView.title}`);
  const weekView = am.buildTimeGrid(new Date(Date.UTC(2026, 6, 6)), 'week', {}, dict);
  check('amazigh week title has ⴰⵎ', weekView.title.includes('ⴰⵎ'), `got ${weekView.title}`);
  check('amazigh week 7 days', weekView.days.length === 7);
  check('amazigh dayNumber gregorian', weekView.days[0].dayNumber >= 1 && weekView.days[0].dayNumber <= 31);
  check('amazigh monthName Tifinagh in week', /[ⴰ-⵿]/.test(weekView.days[0].monthName), `got ${weekView.days[0].monthName}`);

  // English + Amazigh calendar uses the Latin "AM" era marker.
  const amEn = new CalendarEngine({ locale: 'en', calendar: 'amazigh' });
  const enView = amEn.buildView(new Date(Date.UTC(2026, 6, 4)), {}, await loadLocale('en'));
  check('amazigh+en uses Latin AM era', enView.yearLabel === '2976 AM (2026)', `got ${enView.yearLabel}`);
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} SMOKE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);