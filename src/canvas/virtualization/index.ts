/**
 * Offscreen-widget virtualization for the canvas (docs/SPEC.md §7, FR-15). The
 * {@link CanvasVirtualizer} observes placed grid items with an
 * `IntersectionObserver` and mounts a widget only while it is near the viewport,
 * tearing it down when it scrolls away — keeping a long page's interactive cost
 * bounded by what fits on screen. {@link PageCanvas} owns the actual mount/unmount
 * (so the lifecycle guarantee still runs in one place); this module owns the
 * observe-and-decide policy.
 */
export { CanvasVirtualizer, DEFAULT_ROOT_MARGIN } from './virtualizer.js';
export type {
  CanvasVirtualizerCallbacks,
  CanvasVirtualizerOptions,
  VirtualizerObserver,
  VirtualizerObserverEntry,
  VirtualizerObserverFactory,
} from './virtualizer.js';
