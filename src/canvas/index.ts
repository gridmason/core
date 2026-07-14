/**
 * The gridstack.js binding (docs/SPEC.md §2): the `<gm-page-canvas>` custom
 * element and the widget-mount lifecycle it guarantees. The **only DOM consumer**
 * in the package — its tests run under happy-dom (see vitest.config.ts) and its
 * end-to-end specs drive a real browser (see e2e/).
 *
 * The engine (`@gridmason/core/engine`) resolves a layout DOM-free; this layer
 * renders the resulting {@link EffectiveLayout} to a real grid, mounting one
 * widget custom element per placed item with the widget ABI. The per-widget
 * error boundary + skeletons + telemetry attribution (`./boundary`) wrap every
 * mount. Edit mode (drag/resize/add/remove/tabs), the keyboard alternative, and
 * virtualization are the sibling C-E3 issues (#18, #19, #21) that build on this
 * mounting + lifecycle foundation.
 */
export * from './PageCanvas/index.js';
export * from './boundary/index.js';
