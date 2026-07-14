/**
 * Canvas-layer persistence helpers (docs/SPEC.md §7, FR-15). The
 * {@link DebouncedLayoutPersistence} decorator coalesces bursts of rapid layout
 * writes into a single trailing write to the host's {@link LayoutPersistencePort}
 * — the "debounce layout writes" half of the canvas perf mandate. It wraps a
 * host adapter and is passed to the edit-mode controller unchanged.
 */
export { DebouncedLayoutPersistence, DEFAULT_DEBOUNCE_MS } from './debounced-persistence.js';
export type { DebouncedLayoutPersistenceOptions } from './debounced-persistence.js';
