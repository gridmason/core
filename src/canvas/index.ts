/**
 * The gridstack.js binding (docs/SPEC.md §2): the `<gm-page-canvas>` custom
 * element and the widget-mount lifecycle it guarantees. The **only DOM consumer**
 * in the package — its tests run under happy-dom (see vitest.config.ts) and its
 * end-to-end specs drive a real browser (see e2e/).
 *
 * The engine (`@gridmason/core/engine`) resolves a layout DOM-free; this layer
 * renders the resulting {@link EffectiveLayout} to a real grid, mounting one
 * widget custom element per placed item with the widget ABI. Edit mode
 * (drag/resize/add/remove/tabs, #18) builds on the mounting + lifecycle
 * foundation; the keyboard alternative (#19), the per-widget error boundary
 * (#20), and virtualization (#21) are the remaining sibling C-E3 issues.
 */
export * from './PageCanvas/index.js';
export * from './edit-mode/index.js';
