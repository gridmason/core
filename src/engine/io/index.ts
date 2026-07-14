/**
 * Layout export / import + anonymous unavailable-widget degradation (docs/SPEC.md
 * §8, FR-13/FR-16). The engine's IO surface: serialize a `LayoutDoc` to JSON
 * ({@link exportLayout}), parse + schema-validate untrusted JSON back into one
 * ({@link importLayout} / {@link validateLayoutDoc}), and project a layout to its
 * renderable form — collapsing widgets this instance cannot render into the
 * anonymous {@link UNAVAILABLE_WIDGET_ID} placeholder ({@link degradeUnavailableWidgets}).
 *
 * All DOM-free (SPEC §2): these operate on JSON and layout values and make the
 * parse / validate / degrade decisions; the canvas renders the anonymous card.
 *
 * The `s7k-widgets-core` POC importer (FR-14) — the boundary that brings a legacy
 * POC localStorage dump forward into current-version `LayoutDoc`s — lives in
 * {@link ./poc-importer/index.js} and is re-surfaced here.
 */
export { validateLayoutDoc } from './validate.js';
export type { LayoutValidation, LayoutValidationCode, LayoutValidationError } from './validate.js';

export { exportLayout } from './export.js';

export { importLayout } from './import.js';
export type { ImportLayoutResult, LayoutImportError, LayoutImportErrorCode } from './import.js';

export { catalogAvailability, degradeUnavailableWidgets, UNAVAILABLE_WIDGET_ID } from './degrade.js';
export type { DegradeResult, WidgetAvailability } from './degrade.js';

export * from './poc-importer/index.js';
