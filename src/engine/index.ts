/**
 * The headless engine (docs/SPEC.md §2): the widget catalog, page-type registry,
 * LayoutDoc operations + the observable layout store, the event model, first-fit
 * placement (#18), and the widget picker (#15). DOM-free by contract — it
 * operates on LayoutDoc JSON and emits change events through the DOM-free
 * {@link Emitter}; the canvas layer is the only DOM consumer. Held at 100%
 * coverage (GW-D20 gate, see vitest.config.ts).
 *
 * This barrel is the public headless API surface a host or the canvas consumes
 * (`@gridmason/core/engine`); see `docs/engine-api.md` for the full map of
 * entry points and the change events each surface emits.
 */
export * from './events/index.js';
export * from './catalog/index.js';
export * from './layout/index.js';
export * from './io/index.js';
export * from './page-types/index.js';
export * from './placement/index.js';
export * from './picker/index.js';
