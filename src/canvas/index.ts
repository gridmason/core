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
 * mount, and edit mode (drag/resize/add/remove/tabs, `./edit-mode`, #18) builds
 * on the mounting + lifecycle foundation. Offscreen-widget virtualization, the
 * debounced-write persistence decorator, and canvas-interactive perf marks
 * (`./virtualization`, `./persistence`, `./perf`, #21, FR-15) keep a long page's
 * interactive cost bounded. The keyboard alternative (#19) is the remaining
 * sibling C-E3 issue.
 */
export * from './PageCanvas/index.js';
export * from './boundary/index.js';
export * from './edit-mode/index.js';
export * from './virtualization/index.js';
export * from './persistence/index.js';
export * from './perf/index.js';
