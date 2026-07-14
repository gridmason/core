/**
 * Canvas-interactive **perf marks** (docs/SPEC.md §7, FR-15 — "p95 canvas
 * interactive < 300 ms after data with telemetry marks").
 *
 * The budget the spec sets is a latency from **data → interactive**: once a host
 * assigns a resolved layout to the canvas, how long until the grid is built and
 * its on-screen widgets are mounting. {@link CanvasPerfMarker} times exactly that
 * window: {@link CanvasPerfMarker.begin} is called when the layout (the data)
 * arrives, {@link CanvasPerfMarker.settle} when the synchronous render completes,
 * and the elapsed time is emitted as a {@link CanvasInteractiveEvent} to a host
 * {@link CanvasPerfTelemetry} sink — the attribution point where a host (or the CI
 * perf smoke) records the measurement and computes a p95 against the budget.
 *
 * Alongside the telemetry event, the marker records **User Timing** entries
 * (`performance.mark` / `performance.measure`) named {@link CANVAS_PERF}, so the
 * same measurement is visible in a browser devtools performance trace without any
 * host wiring. Both surfaces are best-effort: where `performance` (or a piece of
 * it) is unavailable the marker still emits the telemetry event using its
 * injectable clock, and where no telemetry sink is set it silently records only
 * the User Timing entries. It never throws — the canvas must never block on
 * measurement (SPEC §7).
 *
 * This is a canvas (DOM/host) concern and makes **no network call** (SPEC §1): the
 * marker hands the event to the sink and nothing more; shipping it anywhere is the
 * host adapter's job. The event is deliberately shaped like the per-widget
 * boundary telemetry (a single `(event) => void` over a typed event) so a host's
 * telemetry adapter (C-E4, #22) folds canvas-level and widget-level marks into one
 * pipeline.
 */

/** The User Timing entry names the marker records (visible in a devtools performance trace). */
export const CANVAS_PERF = {
  /** Mark set when the layout (data) arrives. */
  begin: 'gm:canvas-data',
  /** Mark set when the canvas becomes interactive (render complete). */
  end: 'gm:canvas-interactive',
  /** Measure spanning `begin` → `end` — the data→interactive latency. */
  measure: 'gm:canvas-interactive',
} as const;

/**
 * A canvas-interactive latency measurement, emitted once per data→interactive
 * render. `durationMs` is the value the p95 budget (< 300 ms) is computed over.
 */
export interface CanvasInteractiveEvent {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'canvas.interactive';
  /** Milliseconds from the layout (data) arriving to the render completing. */
  readonly durationMs: number;
  /** How many widget instances the layout placed on the active grid. */
  readonly placedCount: number;
  /** How many of those were actually mounted at settle time (< placed when virtualized). */
  readonly mountedCount: number;
  /** Whether virtualization was active for this render. */
  readonly virtualized: boolean;
}

/** The counts a render reports at {@link CanvasPerfMarker.settle}. */
export interface CanvasInteractiveCounts {
  /** Widget instances placed on the active grid. */
  readonly placedCount: number;
  /** Widget instances actually mounted at settle time. */
  readonly mountedCount: number;
  /** Whether virtualization was active. */
  readonly virtualized: boolean;
}

/** The telemetry sink canvas-interactive marks are emitted to (a host adapter supplies it). */
export type CanvasPerfTelemetry = (event: CanvasInteractiveEvent) => void;

/** The `performance` slice the marker uses — all optional so any subset degrades gracefully. */
export interface PerformanceLike {
  now?: () => number;
  mark?: (name: string) => unknown;
  measure?: (name: string, start?: string, end?: string) => unknown;
  clearMarks?: (name?: string) => void;
  clearMeasures?: (name?: string) => void;
}

/** Tunable, injectable behaviour for a {@link CanvasPerfMarker}. */
export interface CanvasPerfMarkerOptions {
  /** The telemetry sink; also settable later via {@link CanvasPerfMarker.setTelemetry}. */
  readonly telemetry?: CanvasPerfTelemetry;
  /** Monotonic clock (ms) for the duration; defaults to `performance.now()` / `Date.now()`. */
  readonly now?: () => number;
  /** The User Timing surface; defaults to the global `performance`. Injectable for tests. */
  readonly performance?: PerformanceLike | undefined;
}

/** The ambient `performance`, or `undefined` where it is unavailable. */
function ambientPerformance(): PerformanceLike | undefined {
  return typeof performance !== 'undefined' ? (performance as PerformanceLike) : undefined;
}

export class CanvasPerfMarker {
  #telemetry: CanvasPerfTelemetry | undefined;
  readonly #now: () => number;
  readonly #perf: PerformanceLike | undefined;

  /** Start time of the in-flight measurement, or `undefined` when none is open. */
  #startedAt: number | undefined;

  constructor(options: CanvasPerfMarkerOptions = {}) {
    this.#telemetry = options.telemetry;
    this.#perf = 'performance' in options ? options.performance : ambientPerformance();
    this.#now = options.now ?? (() => this.#perf?.now?.() ?? Date.now());
  }

  /** Replace the telemetry sink (a host may wire it after construction). */
  setTelemetry(telemetry: CanvasPerfTelemetry | undefined): void {
    this.#telemetry = telemetry;
  }

  /**
   * Open a measurement: record the start time and set the `begin` User Timing
   * mark. Called when the layout (data) is assigned. Re-arming (a second `begin`
   * before a `settle`) simply restarts from the newer data.
   */
  begin(): void {
    this.#startedAt = this.#now();
    this.#safe(() => this.#perf?.mark?.(CANVAS_PERF.begin));
  }

  /**
   * Close the measurement opened by {@link begin}: record the `end` mark and the
   * `begin → end` measure, then emit a {@link CanvasInteractiveEvent} with the
   * elapsed duration and the supplied counts. A no-op if no measurement is open
   * (a render not triggered by fresh data).
   */
  settle(counts: CanvasInteractiveCounts): void {
    const startedAt = this.#startedAt;
    if (startedAt === undefined) return;
    this.#startedAt = undefined;

    const durationMs = Math.max(0, this.#now() - startedAt);
    this.#safe(() => {
      this.#perf?.mark?.(CANVAS_PERF.end);
      this.#perf?.measure?.(CANVAS_PERF.measure, CANVAS_PERF.begin, CANVAS_PERF.end);
      // Keep the User Timing buffer from growing unbounded across many renders.
      this.#perf?.clearMarks?.(CANVAS_PERF.begin);
      this.#perf?.clearMarks?.(CANVAS_PERF.end);
      this.#perf?.clearMeasures?.(CANVAS_PERF.measure);
    });

    this.#telemetry?.({
      type: 'canvas.interactive',
      durationMs,
      placedCount: counts.placedCount,
      mountedCount: counts.mountedCount,
      virtualized: counts.virtualized,
    });
  }

  /** Run a best-effort User Timing side effect, swallowing any failure (never block on measurement). */
  #safe(fn: () => void): void {
    try {
      fn();
    } catch {
      // A hostile/partial `performance` implementation must never crash a render.
    }
  }
}
