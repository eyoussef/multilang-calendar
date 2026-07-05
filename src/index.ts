/**
 * multilang-calendar — framework-agnostic core entry.
 *
 * Importing this entry also emits the stylesheet (`dist/calendar.css`,
 * re-exported as `multilang-calendar/style.css`) for consumers who render the
 * grid markup themselves or use the React/Vue bindings.
 */
import './styles/calendar.css';
import './locales';

export * from './core';
export { availableLocales } from './locales';
export type { LocaleDictionary } from './core/types';