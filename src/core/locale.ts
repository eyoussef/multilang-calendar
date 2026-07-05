/**
 * Locale registry with lazy dictionary loading.
 *
 * Built-in dictionaries are dynamically imported on first use so they can be
 * code-split (the "all languages via lazy dictionaries" requirement). Users
 * can also register their own dictionaries at runtime.
 */
import type { LocaleDictionary } from './types';

const registry = new Map<string, LocaleDictionary>();
const loaders = new Map<string, () => Promise<{ default: LocaleDictionary }>>();

/**
 * Register a dictionary synchronously. Use this for app-supplied locales or to
 * preload a built-in one.
 */
export function registerLocale(dict: LocaleDictionary): void {
  registry.set(dict.code, dict);
}

/** Register a lazy loader for a locale (used by the built-in dictionaries). */
export function registerLocaleLoader(
  code: string,
  loader: () => Promise<{ default: LocaleDictionary }>,
): void {
  loaders.set(code, loader);
}

/** Synchronously get a registered dictionary, or undefined. */
export function getLocaleSync(code: string): LocaleDictionary | undefined {
  return registry.get(code);
}

/** Asynchronously load a locale, caching the result. */
export async function loadLocale(code: string): Promise<LocaleDictionary> {
  const existing = registry.get(code);
  if (existing) return existing;
  const loader = loaders.get(code);
  if (!loader) {
    throw new Error(
      `[multilang-calendar] No loader registered for locale "${code}". ` +
        `Register one with registerLocaleLoader() or registerLocale().`,
    );
  }
  const mod = await loader();
  registry.set(code, mod.default);
  return mod.default;
}

/** Resolve the effective locale tag for Intl formatting. Falls back to "en". */
export function resolveLocale(code: string | undefined): string {
  return code && code.trim() ? code : 'en';
}

/** Detect text direction for a locale tag. */
export function isRTL(code: string): boolean {
  try {
    const locale = new Intl.Locale(code) as Intl.Locale & {
      textInfo?: { direction?: string };
    };
    const dir = locale.textInfo?.direction;
    if (dir) return dir === 'rtl';
  } catch {
    /* ignore */
  }
  const lang = code.toLowerCase().split('-')[0];
  return ['ar', 'he', 'fa', 'ur', 'ckb', 'sd', 'ps', 'yi'].includes(lang);
}

/** Resolve the first day of the week for a locale tag (0=Sun..6=Sat). */
export function firstDayOfWeekFor(code: string): number {
  try {
    const locale = new Intl.Locale(code) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
    };
    const first = locale.weekInfo?.firstDay;
    // Intl weekInfo uses 1=Mon..7=Sun; the engine wants 0=Sun..6=Sat.
    if (typeof first === 'number') return first % 7;
  } catch {
    /* ignore */
  }
  // Sensible fallback: 0 (Sunday) for en/zh/etc., 1 (Monday) for most others.
  const lang = code.toLowerCase().split('-')[0];
  return ['en', 'zh', 'ja', 'ko', 'tzm'].includes(lang) ? 0 : 1;
}