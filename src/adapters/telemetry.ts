/**
 * Telemetry adapter (docs/SPEC.md §2, §4, §7, FR-12) — per-widget error and
 * latency attribution.
 *
 * The host receives structured telemetry events through this sink; core emits
 * them but performs no I/O and makes no network calls (SPEC §1). Two event
 * classes matter for widget attribution (SPEC §7): a **widget error** (a widget
 * threw or its boundary tripped) and a **widget latency** measurement (the
 * mount-to-interactive time, or a budget breach the host uses to auto-degrade a
 * slow widget to its fallback — FR-15, p95 < 300 ms).
 *
 * Those two event classes are the **canonical canvas-boundary event types**
 * ({@link WidgetErrorEvent}, {@link WidgetLatencyEvent}): the per-widget error
 * boundary (C-E4, #20) is their sole producer and shipped them publicly in
 * `@gridmason/core@0.3.0`. This adapter **re-uses those exact types** rather than
 * redefining them, so a host sees one shape at both layers — there is a single
 * definition, imported everywhere.
 *
 * This adapter is the **canonical superset** sink: {@link TelemetryEvent} unions
 * the two widget-boundary events with the catalog's narrow refusal event
 * ({@link CatalogRefusalEvent}, issue #12/#13), so one host adapter records
 * catalog refusals and widget attribution alike. {@link catalogTelemetryFor}
 * bridges a `TelemetryAdapter` to the `CatalogTelemetry` the {@link WidgetCatalog}
 * constructor expects, so the two are wired — not duplicated.
 *
 * The widget event types are imported **type-only** from the canvas boundary,
 * which is a DOM-free type-declaration module; the import erases at compile time,
 * so this host-seam module keeps no runtime canvas/DOM dependency.
 */
import type { WidgetErrorEvent, WidgetLatencyEvent } from '../canvas/boundary/telemetry.js';
import type { CatalogRefusalEvent, CatalogTelemetry } from '../engine/catalog/index.js';

export type { WidgetErrorEvent, WidgetLatencyEvent } from '../canvas/boundary/telemetry.js';
export type { CatalogRefusalEvent, CatalogTelemetry } from '../engine/catalog/index.js';

/**
 * Every event core attributes through the telemetry adapter: the per-widget error
 * and latency events emitted by the canvas boundary ({@link WidgetErrorEvent},
 * {@link WidgetLatencyEvent}, SPEC §7), plus the catalog registration refusal
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
