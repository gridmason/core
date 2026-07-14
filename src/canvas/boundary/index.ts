/**
 * The per-widget error boundary, loading skeletons, and telemetry attribution
 * (docs/SPEC.md §7, FR-10) — the canvas resilience layer over the mount manager.
 * A widget that throws, fails to load, reports an error, or exceeds its latency
 * budget is isolated behind a {@link WidgetBoundary} fallback card while its
 * siblings and the canvas stay live; slow widgets show a skeleton; per-widget
 * error/latency attribution flows to a host {@link WidgetTelemetry} sink.
 */
export { WidgetBoundaryManager } from './boundary-manager.js';
export type { WidgetBoundaryManagerOptions } from './boundary-manager.js';

export { WidgetBoundary } from './widget-boundary.js';
export type {
  BoundaryMountInput,
  WidgetBoundaryConfig,
  WidgetBoundaryDeps,
  WidgetBoundaryState,
  WidgetDescriptor,
} from './widget-boundary.js';

export { createSkeleton } from './skeleton.js';
export { createFallbackCard } from './fallback-card.js';
export type { CreateFallbackCardOptions, FallbackCard } from './fallback-card.js';

export type { BoundaryAnnounce } from './announcements.js';
export * as boundaryAnnouncements from './announcements.js';

export {
  BOUNDARY_CLASS,
  BOUNDARY_STATE,
  BOUNDARY_STYLE_ID,
  ensureBoundaryStyles,
} from './styles.js';

export type {
  WidgetBoundaryEvent,
  WidgetErrorEvent,
  WidgetFailureReason,
  WidgetInstanceIdentity,
  WidgetLatencyEvent,
  WidgetLatencyPhase,
  WidgetRecoveryEvent,
  WidgetTelemetry,
} from './telemetry.js';
