/**
 * Built-in locale dictionaries, registered as lazy loaders so each language is
 * only fetched on first use (the "all languages via lazy dictionaries" model
 * required by the package brief).
 *
 * Each loader is a *static* dynamic import so the bundler can analyse and
 * code-split every dictionary into its own chunk.
 */
import { registerLocaleLoader } from '../core/locale';
import type { LocaleDictionary } from '../core/types';

export * from '../core';

const loaders: Record<string, () => Promise<{ default: LocaleDictionary }>> = {
  en: () => import('./en.json'),
  ar: () => import('./ar.json'),
  fr: () => import('./fr.json'),
  es: () => import('./es.json'),
  de: () => import('./de.json'),
  zh: () => import('./zh.json'),
  zgh: () => import('./zgh.json'), // Standard Moroccan Tamazight (Tifinagh)
};

for (const code of Object.keys(loaders)) {
  registerLocaleLoader(code, loaders[code]);
}

export const availableLocales: string[] = Object.keys(loaders);