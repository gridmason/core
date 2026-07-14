/**
 * Canvas-interactive perf marks (docs/SPEC.md §7, FR-15). {@link CanvasPerfMarker}
 * times the data→interactive window and emits it as a {@link CanvasInteractiveEvent}
 * to a host {@link CanvasPerfTelemetry} sink (the p95 < 300 ms attribution point),
 * while also recording `performance.mark`/`measure` User Timing entries for a
 * devtools trace. {@link PageCanvas} drives it around each data-triggered render.
 */
export { CanvasPerfMarker, CANVAS_PERF } from './marks.js';
export type {
  CanvasInteractiveCounts,
  CanvasInteractiveEvent,
  CanvasPerfMarkerOptions,
  CanvasPerfTelemetry,
  PerformanceLike,
} from './marks.js';
