/**
 * Timezone-safe date helpers. The engine works entirely in UTC to avoid
 * off-by-one issues when rendering calendar days across timezones.
 */

/** Parse an ISO `yyyy-mm-dd` string into a UTC midnight Date. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Format a Date as ISO `yyyy-mm-dd` using its UTC components. */
export function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Add (or subtract) a number of days, returning a new UTC Date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** The UTC Date of the start of the week containing `date`, given a
 *  firstDayOfWeek (0=Sun..6=Sat). */
export function startOfWeek(date: Date, firstDayOfWeek: number): Date {
  const dow = date.getUTCDay();
  const diff = (dow - firstDayOfWeek + 7) % 7;
  return addDays(date, -diff);
}

/** Today as an ISO string, based on UTC. */
export function todayISO(): string {
  return toISO(new Date());
}

/** Compare two ISO dates lexicographically (works for `yyyy-mm-dd`). */
export function isoLT(a: string, b: string): boolean {
  return a < b;
}
export function isoLTE(a: string, b: string): boolean {
  return a <= b;
}

/** ISO-8601 week number for a UTC date. Returns 1..53. */
export function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}