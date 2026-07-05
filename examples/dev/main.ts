/**
 * Dev demo for the web component binding. Shows live locale + calendar system
 * switching, event markers, and a single-date selection readout.
 */
import '../../src/web'; // registers <intl-calendar>
import { toISO } from '../../src/core/dateUtils';

const cal = document.getElementById('cal') as any;
const localeSel = document.getElementById('locale') as HTMLSelectElement;
const calSel = document.getElementById('calendar') as HTMLSelectElement;
const weeksChk = document.getElementById('weeks') as HTMLInputElement;
const out = document.getElementById('out') as HTMLElement;
const evt = document.getElementById('evt') as HTMLElement;

// Some sample markers: date-only (dots in month view / all-day chips in
// week & day) plus timed events (positioned blocks in week & day grids).
const markers = [
  { date: '2026-07-04', label: 'Release day', color: '#16a34a' },
  { date: '2026-07-14', label: 'Review', color: '#dc2626' },
  { date: '2026-07-20', label: 'Sync (all day)', color: '#9333ea' },
  { date: '2026-07-06', label: 'Standup', start: '09:00', end: '09:30', color: '#2563eb' },
  { date: '2026-07-06', label: 'Sprint planning', start: '09:15', end: '10:30', color: '#7c3aed' },
  { date: '2026-07-06', label: 'Lunch', start: '12:00', end: '13:00', color: '#ea580c' },
  { date: '2026-07-07', label: '1:1', start: '15:00', end: '15:45', color: '#0d9488' },
  { date: '2026-07-09', label: 'Demo', start: '14:00', end: '15:00', color: '#dc2626' },
  { date: '2026-07-09', label: 'Demo prep', start: '13:00', end: '14:00', color: '#dc2626' },
];
cal.markers = markers;
cal.value = '2026-07-06';
cal.setAttribute('view', 'week');

const viewSel = document.getElementById('view') as HTMLSelectElement;

function apply() {
  cal.setAttribute('locale', localeSel.value);
  cal.setAttribute('calendar', calSel.value);
  cal.setAttribute('week-numbers', weeksChk.checked ? 'true' : 'false');
  cal.setAttribute('view', viewSel.value);
  cal.setAttribute('markers', JSON.stringify(markers));
}

viewSel.addEventListener('change', apply);

localeSel.addEventListener('change', apply);
calSel.addEventListener('change', apply);
weeksChk.addEventListener('change', apply);

cal.addEventListener('select', (e: any) => {
  out.textContent = e.detail.date;
  evt.textContent = `select ${e.detail.date}`;
});
cal.addEventListener('navigate', (e: any) => {
  evt.textContent = `navigate ${e.detail.anchor}`;
});

apply();

// Expose the engine for quick console experimentation.
import('../../src/core').then((m) => {
  (window as any).multilangCalendar = m;
  console.log(
    'availableLocales',
    m.availableLocales,
    'today (ISO)',
    toISO(new Date()),
  );
});