/**
 * The headless engine (docs/SPEC.md §2): catalog, layout resolution +
 * governance, placement, and picker gating. DOM-free by contract — it operates
 * on LayoutDoc JSON and emits change events; the canvas layer is the only DOM
 * consumer. Held at 100% coverage (GW-D20 gate, see vitest.config.ts).
 *
 * Placeholder — no engine logic yet; populated by the C-E1 epic.
 */
export * from './catalog/index.js';
export * from './layout/index.js';
export * from './placement/index.js';
export * from './picker/index.js';
