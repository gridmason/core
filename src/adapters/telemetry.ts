/**
 * Telemetry adapter (docs/SPEC.md §2, §4, §7, FR-12) — per-widget error and
 * latency attribution.
 *
 * The host receives structured telemetry events through this sink; core emits
 * them but performs no I/O and makes no network calls (SPEC §1). Two event
 * classes matter for widget attribution (SPEC §7): a **widget error** (a widget
 * threw or its boundary tripped) and a **widget latency** mark (a phase's
 * duration, so a host can auto-degrade a widget that exceeds its budget to its
 * fallback — FR-15, p95 < 300 ms).
 *
 * It is the **canonical superset** of the catalog's narrow refusal sink
 * ({@link CatalogTelemetry}, issue #12/#13): {@link CatalogRefusalEvent} is one
 * variant of {@link TelemetryEvent}, so a single host adapter records catalog
 * refusals and widget attribution alike. {@link catalogTelemetryFor} bridges a
 * `TelemetryAdapter` to the `CatalogTelemetry` the {@link WidgetCatalog}
 * constructor expects, so the two are wired — not duplicated.
 */
import type { WidgetID } from '@gridmason/protocol';

import type { CatalogRefusalEvent, CatalogTelemetry } from '../engine/catalog/index.js';

export type { CatalogRefusalEvent, CatalogTelemetry } from '../engine/catalog/index.js';

/**
 * A widget instance raised an error — it threw during mount/render, or its
 * per-widget error boundary (C-E3) tripped and fell back. Attributed to the
 * source-qualified widget identity and, when known, the specific instance.
 */
export interface WidgetErrorEvent {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'widget.error';
  /** The source-qualified widget the error is attributed to. */
  readonly widget: WidgetID;
  /** The failing instance's layout id (`LayoutWidget.i`), when known. */
  readonly instanceId?: string;
  /** The page-type id the widget was mounted on, when known. */
  readonly pageTypeId?: string;
  /** The thrown value, passed through opaquely (may be any type). */
  readonly error: unknown;
}

/**
 * A widget instance's latency mark for one phase — a perf attribution the host
 * uses to enforce budgets (SPEC §7, FR-15) and, on repeated breach, auto-degrade
 * the widget to its fallback.
 */
export interface WidgetLatencyEvent {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'widget.latency';
  /** The source-qualified widget the mark is attributed to. */
  readonly widget: WidgetID;
  /** The instance's layout id (`LayoutWidget.i`), when known. */
  readonly instanceId?: string;
  /** The lifecycle phase measured (e.g. `mount`, `render`, `update`). */
  readonly phase: string;
  /** Wall-clock duration of the phase, in milliseconds. */
  readonly durationMs: number;
  /** Whether the duration exceeded the host/engine budget for this phase. */
  readonly overBudget?: boolean;
}

/**
 * Every event core attributes through the telemetry adapter: widget error and
 * latency marks (SPEC §7), plus the catalog registration refusal
 * ({@link CatalogRefusalEvent}, SPEC §4) — one discriminated union keyed on
 * `type`, so a host `switch`es exhaustively over a single stream.
 */
export type TelemetryEvent = WidgetErrorEvent | WidgetLatencyEvent | CatalogRefusalEvent;

/**
 * The host telemetry adapter: a single sink for every {@link TelemetryEvent}.
 * Records only — it returns nothing and must not throw back into core (a
 * misbehaving sink must never break widget rendering or catalog registration).
 */
export interface TelemetryAdapter {
  /** Record one telemetry event. Must not throw. */
  record(event: TelemetryEvent): void;
}

/**
 * Bridge a {@link TelemetryAdapter} to the narrow {@link CatalogTelemetry} the
 * {@link WidgetCatalog} constructor accepts — `new WidgetCatalog({ telemetry:
 * catalogTelemetryFor(adapter) })`. Reconciles the catalog's refusal sink into
 * the full adapter without either side depending on the other.
 */
export function catalogTelemetryFor(adapter: TelemetryAdapter): CatalogTelemetry {
  return (event: CatalogRefusalEvent) => {
    adapter.record(event);
  };
}
