/**
 * `WidgetBoundaryManager` — the canvas's collection of per-widget boundaries
 * (docs/SPEC.md §7, FR-10). It sits between `PageCanvas` and the
 * {@link WidgetMountManager}: instead of mounting a widget element straight into
 * a grid cell, the canvas mounts it through a {@link WidgetBoundary}, so every
 * widget gets an error boundary + loading skeleton and the canvas reports
 * per-widget error/latency telemetry — without the canvas itself growing any of
 * that logic.
 *
 * One shared {@link WidgetMountManager} backs every boundary, so the SPEC §4
 * disconnect-before-reuse guarantee still holds in exactly one place; each
 * boundary owns only the surrounding DOM (container/slot/skeleton/card) and the
 * failure state machine for its instance. The manager keeps the mount-manager-
 * shaped surface `PageCanvas` already uses (`mount` / `updateAbiState` / `unmount`
 * / `unmountAll` / `get` / `instanceIds` / `size`) so wiring it in is a small,
 * additive change.
 *
 * Behaviour (telemetry sink, descriptor, latency budget, auto-degrade) is host-
 * supplied via {@link WidgetBoundaryManager.configure} and read **live** on each
 * mount/retry, so a host may set it before or after the first render.
 */
import { WidgetMountManager } from '../PageCanvas/mount-manager.js';
import type { WidgetAbiState } from '../PageCanvas/abi.js';

import { WidgetBoundary } from './widget-boundary.js';
import type { BoundaryMountInput, WidgetBoundaryConfig } from './widget-boundary.js';

/** Options for constructing a {@link WidgetBoundaryManager}. */
export interface WidgetBoundaryManagerOptions {
  /**
   * The document boundaries build their DOM in and create widget elements from.
   * Defaults to the ambient `document`; injectable for tests / an iframe canvas
   * (mirrors {@link WidgetMountManager}).
   */
  readonly ownerDocument?: Document;
  /** Monotonic clock for latency timing; defaults to `performance.now()` (or `Date.now`). */
  readonly now?: () => number;
  /** Initial boundary behaviour (see {@link WidgetBoundaryConfig}); also settable later via {@link configure}. */
  readonly config?: WidgetBoundaryConfig;
}

/** The default monotonic clock: `performance.now()` when available, else `Date.now()`. */
function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class WidgetBoundaryManager {
  readonly #mounts: WidgetMountManager;
  readonly #boundaries = new Map<string, WidgetBoundary>();
  readonly #document: Document;
  readonly #now: () => number;
  #config: WidgetBoundaryConfig;

  constructor(options: WidgetBoundaryManagerOptions = {}) {
    this.#document = options.ownerDocument ?? document;
    this.#now = options.now ?? defaultNow;
    this.#config = options.config ?? {};
    this.#mounts = new WidgetMountManager({ ownerDocument: this.#document });
  }

  /**
   * Replace the live boundary config (telemetry sink, descriptor, latency budget,
   * auto-degrade). Applies to the next mount/retry of every boundary — existing
   * skeletons/cards are not retroactively rebuilt.
   */
  configure(config: WidgetBoundaryConfig): void {
    this.#config = config;
  }

  /**
   * Mount a widget for `input.instanceId` inside a fresh boundary appended to
   * `host`. Refuses a double-mount for the same instance (mirrors the mount
   * manager): the caller must {@link unmount} first.
   */
  mount(host: HTMLElement, input: BoundaryMountInput): WidgetBoundary {
    if (this.#boundaries.has(input.instanceId)) {
      throw new Error(
        `a boundary is already mounted for instance '${input.instanceId}'; unmount first`,
      );
    }
    const boundary = new WidgetBoundary(host, input, {
      mounts: this.#mounts,
      ownerDocument: this.#document,
      config: () => this.#config,
      now: this.#now,
    });
    this.#boundaries.set(input.instanceId, boundary);
    boundary.mount();
    return boundary;
  }

  /**
   * Update a mounted widget's mutable ABI in place (no re-mount). A no-op
   * returning `false` if no boundary is mounted for `instanceId`.
   */
  updateAbiState(instanceId: string, state: WidgetAbiState): boolean {
    const boundary = this.#boundaries.get(instanceId);
    if (boundary === undefined) return false;
    boundary.updateAbiState(state);
    return true;
  }

  /** Re-assign the opaque SDK handle on every mounted widget (and future retries). */
  reassignSdk(sdk: unknown): void {
    for (const boundary of this.#boundaries.values()) boundary.reassignSdk(sdk);
  }

  /**
   * Unmount the boundary for `instanceId` (unmounting its widget — firing
   * `disconnectedCallback` — and removing its container). Returns whether one was
   * mounted.
   */
  unmount(instanceId: string): boolean {
    const boundary = this.#boundaries.get(instanceId);
    if (boundary === undefined) return false;
    this.#boundaries.delete(instanceId);
    boundary.unmount();
    return true;
  }

  /** Unmount every boundary (each firing its widget's `disconnectedCallback`). Safe to call twice. */
  unmountAll(): void {
    for (const instanceId of [...this.#boundaries.keys()]) this.unmount(instanceId);
  }

  /** The boundary for `instanceId`, or `undefined`. */
  get(instanceId: string): WidgetBoundary | undefined {
    return this.#boundaries.get(instanceId);
  }

  /** The live widget element for `instanceId`, or `undefined` (unmounted / in its error state). */
  widgetElement(instanceId: string): HTMLElement | undefined {
    return this.#boundaries.get(instanceId)?.element;
  }

  /** Whether a boundary is mounted for `instanceId`. */
  has(instanceId: string): boolean {
    return this.#boundaries.has(instanceId);
  }

  /** The instance ids currently mounted, in mount order. */
  get instanceIds(): readonly string[] {
    return [...this.#boundaries.keys()];
  }

  /** How many boundaries are currently mounted. */
  get size(): number {
    return this.#boundaries.size;
  }
}
