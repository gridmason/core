/**
 * The canvas-layer telemetry port for per-widget **error and latency
 * attribution** (docs/SPEC.md §7, FR-10).
 *
 * The per-widget error boundary (see `./widget-boundary.ts`) reports, through
 * this port, which widget instance failed or how long it took to become
 * interactive — so a host may auto-degrade a widget that exceeds its budgets to
 * its fallback. The port is a plain function sink, deliberately shaped like the
 * engine's {@link import('../../engine/catalog/index.js').CatalogTelemetry} (a
 * single `(event) => void` over a discriminated event union): the two are the
 * same telemetry *idea* at two layers (catalog registration refusals vs. mounted-
 * widget failures), and the finalized C-E4 telemetry adapter (#22, on `epic/5`)
 * is a superset of both. This canvas-local port is defined here — not imported
 * from the adapter — so the boundary does not couple to that branch; when the
 * adapter lands, this union folds into it (reconciliation noted in the #20 PR).
 *
 * Telemetry is **not** a user-facing surface: it flows to the host adapter, never
 * to the DOM, so every event carries the widget's full source-qualified identity
 * (`instanceId` + `widgetID`) for attribution. This is distinct from the fallback
 * *card*, which must not echo a tag/name it cannot attribute (SPEC §6/§8 no-
 * capability-leakage) — the card's naming is gated by a descriptor resolver, the
 * telemetry event is not.
 *
 * Core makes **zero network calls** (SPEC §1, §8): the boundary hands the event
 * to this sink and nothing more; shipping it anywhere is the host's concern.
 */
import type { WidgetID } from '@gridmason/protocol';

/**
 * The identity a telemetry event attributes a failure or latency measurement to:
 * the layout instance key plus the source-qualified widget identity it was
 * mounting. Together these say *which placed widget, from which source*.
 */
export interface WidgetInstanceIdentity {
  /** The layout instance id (`LayoutWidget.i`) the event is about. */
  readonly instanceId: string;
  /** The source-qualified `(source, tag)` identity of the widget type. */
  readonly widgetID: WidgetID;
}

/**
 * Why a widget fell back to its error card.
 *
 * - `unresolved` — the widget's custom-element tag was **not defined** in the
 *   registry at mount time, so it could never upgrade (a load failure — the host
 *   never registered the type). This is the SPEC §8 "unavailable widget" case:
 *   the card is anonymous unless a descriptor names the entitled type.
 * - `threw` — the tag was defined but the widget **threw during `connectedCallback`**
 *   (or construction) as it mounted.
 * - `reported` — the widget mounted, then **dispatched a `gm:error` event** to
 *   signal a runtime failure of its own.
 * - `timeout` — the widget went pending (skeleton) and **exceeded its latency
 *   budget**, and the boundary was configured to auto-degrade it to the fallback.
 */
export type WidgetFailureReason = 'unresolved' | 'threw' | 'reported' | 'timeout';

/**
 * A widget instance fell back to its error card — emitted once per transition
 * into the error state (an entitled load failure or a runtime throw/report).
 */
export interface WidgetErrorEvent extends WidgetInstanceIdentity {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'widget.error';
  /** Why the widget fell back (see {@link WidgetFailureReason}). */
  readonly reason: WidgetFailureReason;
  /** A human-readable message, when one is available (e.g. the thrown error's message). */
  readonly message?: string;
  /** The underlying thrown value / `gm:error` detail, when present — for host logging. */
  readonly error?: unknown;
}

/**
 * When a latency measurement was taken.
 *
 * - `settled` — the widget became **interactive** (mounted synchronously, or
 *   dispatched `gm:ready`); `elapsedMs` is the mount-to-ready time.
 * - `exceeded` — the widget was still pending when its **latency budget** ran
 *   out; `elapsedMs` is the budget, `exceeded` is `true`.
 */
export type WidgetLatencyPhase = 'settled' | 'exceeded';

/**
 * A per-widget latency measurement — the mount-to-interactive time (`settled`)
 * or a budget breach (`exceeded`). A host watches `exceeded` events to decide
 * whether to auto-degrade a slow widget (SPEC §7).
 */
export interface WidgetLatencyEvent extends WidgetInstanceIdentity {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'widget.latency';
  /** Whether the widget settled or blew its budget. */
  readonly phase: WidgetLatencyPhase;
  /** Milliseconds from mount to this measurement (the budget itself, when `exceeded`). */
  readonly elapsedMs: number;
  /** The configured latency budget, when one applied. */
  readonly budgetMs?: number;
  /** Whether the latency budget was exceeded (`true` iff `phase === 'exceeded'`). */
  readonly exceeded: boolean;
}

/**
 * Every event the per-widget boundary emits to the telemetry port: a failure
 * ({@link WidgetErrorEvent}) or a latency measurement ({@link WidgetLatencyEvent}).
 */
export type WidgetBoundaryEvent = WidgetErrorEvent | WidgetLatencyEvent;

/**
 * The telemetry sink the boundary emits to (SPEC §7). A plain function, shaped
 * like the engine's `CatalogTelemetry`; a host adapter supplies it. Optional —
 * with none, the boundary still renders fallbacks and skeletons, it just reports
 * nothing.
 */
export type WidgetTelemetry = (event: WidgetBoundaryEvent) => void;
