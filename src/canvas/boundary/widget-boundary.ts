/**
 * `WidgetBoundary` — the per-widget error boundary + loading skeleton for one
 * mounted widget instance (docs/SPEC.md §7, FR-10). It wraps a single widget so
 * that if the widget **throws, fails to load, reports an error, or blows its
 * latency budget**, it is replaced by a fallback card (name + retry) while its
 * siblings and the rest of the canvas are unaffected — one widget's failure never
 * takes the page down. A widget that declares itself pending shows a skeleton
 * until it becomes interactive; the canvas never blocks on widget code.
 *
 * ## The widget readiness contract
 *
 * The boundary reads three DOM `CustomEvent`s a widget may dispatch (they bubble
 * to the boundary container), plus one attribute:
 *
 * - **`gm:loading`** (or the boolean attribute `gm-loading` set during
 *   `connectedCallback`) — the widget is initializing asynchronously; show a
 *   skeleton and start the latency budget. A widget that finishes **synchronously**
 *   dispatches nothing and is considered interactive as soon as its
 *   `connectedCallback` returns (no skeleton) — so a trivial widget is never
 *   stranded behind a spinner.
 * - **`gm:ready`** — the widget is now interactive; hide the skeleton and reveal
 *   it. The mount-to-ready time is reported to telemetry (`widget.latency`,
 *   `settled`).
 * - **`gm:error`** (`detail?: { message?: string; error?: unknown }`) — the widget
 *   hit a runtime failure; fall back to the error card.
 *
 * A widget whose tag was **never defined** in the registry is an entitled *load
 * failure* (`unresolved`) and goes straight to the fallback — unlike a *gated-off*
 * instance, which the engine omits from the effective layout entirely and so
 * never reaches a boundary (SPEC §6: no card, no capability leakage).
 *
 * ## Retry
 *
 * The card's retry re-runs the whole mount lifecycle cleanly: the current element
 * (if any) is unmounted — firing its `disconnectedCallback` — before a fresh one
 * is mounted, upholding the SPEC §4 lifecycle guarantee. A retry uses the latest
 * ABI state (context/settings/edit-mode), which may have changed while the widget
 * was in its error state.
 *
 * This is a canvas (DOM) concern; the engine layer never touches the DOM (SPEC §2)
 * and core makes no network calls (SPEC §1) — telemetry is handed to an adapter
 * port, nothing is fetched.
 */
import type { WidgetID } from '@gridmason/protocol';

import { assignSdkHandle } from '../PageCanvas/abi.js';
import type { WidgetAbiState, WidgetMountInput } from '../PageCanvas/abi.js';
import type { WidgetMountManager } from '../PageCanvas/mount-manager.js';

import { createFallbackCard } from './fallback-card.js';
import { createSkeleton } from './skeleton.js';
import { BOUNDARY_CLASS, BOUNDARY_STATE, ensureBoundaryStyles } from './styles.js';
import type {
  WidgetBoundaryEvent,
  WidgetFailureReason,
  WidgetInstanceIdentity,
  WidgetTelemetry,
} from './telemetry.js';

/**
 * Resolves a **display name** for a widget instance, or `undefined` to leave the
 * fallback card anonymous. The host supplies this; it returns a name only for a
 * widget the viewer is entitled to and the host can attribute, so an unknown /
 * unentitled tag yields an anonymous "Unavailable widget" card with no tag/name
 * echo (SPEC §6/§8 no-capability-leakage).
 */
export type WidgetDescriptor = (identity: WidgetInstanceIdentity) => string | undefined;

/**
 * A {@link WidgetMountInput} augmented with the source-qualified `widgetID`. The
 * mount manager only needs the custom-element `tag`, but the boundary also needs
 * the `(source, tag)` identity to **attribute** telemetry events (a bare tag is
 * not identity — SPEC §4). Carried here rather than re-derived so the boundary
 * never loses which *source* a failing widget came from.
 */
export interface BoundaryMountInput extends WidgetMountInput {
  /** The source-qualified identity of the widget type (from `LayoutWidget.widgetID`). */
  readonly widgetID: WidgetID;
}

/** Tunable, host-supplied boundary behaviour, read live at each mount/retry. */
export interface WidgetBoundaryConfig {
  /** The telemetry sink for per-widget error + latency attribution (SPEC §7). */
  readonly telemetry?: WidgetTelemetry;
  /** Resolves a display name for the fallback card (see {@link WidgetDescriptor}). */
  readonly describe?: WidgetDescriptor;
  /** Milliseconds a pending widget may take before a `widget.latency` `exceeded` event fires. Omitted / `0` disables the budget. */
  readonly latencyBudgetMs?: number;
  /** When `true`, a widget that exceeds its latency budget is auto-degraded to its fallback card (SPEC §7). */
  readonly autoDegradeOnLatency?: boolean;
}

/** The collaborators one {@link WidgetBoundary} needs, supplied by the manager. */
export interface WidgetBoundaryDeps {
  /** The shared mount manager that upholds the disconnect-before-reuse guarantee (SPEC §4). */
  readonly mounts: WidgetMountManager;
  /** The document the boundary builds its DOM in. */
  readonly ownerDocument: Document;
  /** The live boundary config (telemetry, descriptor, budget) — read on each mount/retry. */
  config(): WidgetBoundaryConfig;
  /** A monotonic clock for latency timing (defaults to `performance.now`); injectable for tests. */
  now(): number;
}

/** The visible state of a boundary. */
export type WidgetBoundaryState = 'idle' | 'loading' | 'ready' | 'error';

/** The widget DOM events the boundary listens for (the readiness contract). */
const WIDGET_EVENT = { loading: 'gm:loading', ready: 'gm:ready', error: 'gm:error' } as const;
/** The boolean attribute a widget may set during connect as an alternative to `gm:loading`. */
const LOADING_ATTR = 'gm-loading';

/** The `detail` shape of a widget's `gm:error` event. */
interface WidgetErrorDetail {
  readonly message?: string;
  readonly error?: unknown;
}

export class WidgetBoundary {
  readonly #input0: BoundaryMountInput;
  readonly #deps: WidgetBoundaryDeps;

  /** The container (carries `data-gm-state`); the slot the widget mounts into. */
  readonly #root: HTMLElement;
  readonly #slot: HTMLElement;

  /** Mutable mount input: ABI state / sdk are refreshed in place so a retry uses the latest. */
  #input: BoundaryMountInput;
  #state: WidgetBoundaryState = 'idle';
  #mountStart = 0;
  #settled = false;
  #pendingSeen = false;
  #mountResolved = false;
  #budgetTimer: ReturnType<typeof setTimeout> | undefined;
  #retryButton: HTMLButtonElement | undefined;

  constructor(host: HTMLElement, input: BoundaryMountInput, deps: WidgetBoundaryDeps) {
    this.#input0 = input;
    this.#input = input;
    this.#deps = deps;
    const doc = deps.ownerDocument;
    ensureBoundaryStyles(doc);

    this.#root = doc.createElement('div');
    this.#root.className = BOUNDARY_CLASS.root;
    this.#root.dataset.gmInstance = input.instanceId;

    this.#slot = doc.createElement('div');
    this.#slot.className = BOUNDARY_CLASS.slot;
    this.#root.appendChild(this.#slot);

    // Listen on the container so `gm:loading` dispatched *during* the widget's
    // connectedCallback (which runs synchronously inside mount, below the slot)
    // bubbles up and is captured before we decide loading-vs-ready.
    this.#root.addEventListener(WIDGET_EVENT.loading, this.#onLoading);
    this.#root.addEventListener(WIDGET_EVENT.ready, this.#onReady);
    this.#root.addEventListener(WIDGET_EVENT.error, this.#onError as EventListener);

    host.appendChild(this.#root);
  }

  /** Mount the widget for the first time, entering the loading/ready/error state. */
  mount(): void {
    this.#beginMount();
  }

  /** The live widget element, or `undefined` when unmounted (e.g. in the error state). */
  get element(): HTMLElement | undefined {
    return this.#deps.mounts.get(this.#input.instanceId)?.element;
  }

  /** The current boundary state (for tests / host introspection). */
  get state(): WidgetBoundaryState {
    return this.#state;
  }

  /** The custom-element tag this boundary mounts — an identity change needs a fresh boundary. */
  get tag(): string {
    return this.#input.tag;
  }

  /** The boundary container element (root of the widget's cell). */
  get root(): HTMLElement {
    return this.#root;
  }

  /**
   * Update the widget's mutable ABI in place (no re-mount), and remember it so a
   * later retry re-mounts with the latest context/settings/edit-mode.
   */
  updateAbiState(state: WidgetAbiState): void {
    this.#input = { ...this.#input, ...state };
    this.#deps.mounts.updateAbiState(this.#input.instanceId, state);
  }

  /** Re-assign the opaque SDK handle on the live element (and for a future retry). */
  reassignSdk(sdk: unknown): void {
    this.#input = { ...this.#input, sdk };
    const el = this.element;
    if (el !== undefined) assignSdkHandle(el, sdk);
  }

  /**
   * Tear the boundary down: unmount the widget (firing its `disconnectedCallback`
   * — the SPEC §4 guarantee), drop its listeners and any pending budget timer,
   * and remove the container from the DOM. Safe to call more than once.
   */
  unmount(): void {
    this.#clearBudget();
    this.#deps.mounts.unmount(this.#input.instanceId);
    this.#root.removeEventListener(WIDGET_EVENT.loading, this.#onLoading);
    this.#root.removeEventListener(WIDGET_EVENT.ready, this.#onReady);
    this.#root.removeEventListener(WIDGET_EVENT.error, this.#onError as EventListener);
    this.#root.remove();
    this.#state = 'idle';
  }

  /** The full lifecycle: skeleton → mount → decide ready/loading, or fall back on failure. */
  #beginMount(): void {
    this.#clearBudget();
    this.#settled = false;
    this.#pendingSeen = false;
    this.#mountResolved = false;
    this.#removeCard();
    this.#renderSkeleton();
    this.#setState('loading');
    this.#mountStart = this.#deps.now();

    if (!this.#tagDefined()) {
      this.#enterError('unresolved');
      return;
    }

    const mounted = this.#attemptMount();
    if (!mounted.ok) {
      this.#enterError('threw', mounted.message, mounted.error);
      return;
    }

    this.#mountResolved = true;
    if (this.#pendingSeen || this.element?.hasAttribute(LOADING_ATTR) === true) {
      this.#toLoading();
    } else {
      this.#enterReady();
    }
  }

  /**
   * Mount the widget, catching a failure however the environment surfaces it. A
   * widget's `connectedCallback` throw does **not** propagate out of `appendChild`
   * in a real browser — it is reported to the window `error` event synchronously
   * — while a constructor throw (and, e.g., happy-dom) *does* propagate. Guard the
   * synchronous mount window with a global `error` listener **and** a try/catch so
   * either surfacing is caught and attributed to this widget (the mount window is
   * synchronous, so any error in it is this widget's). `preventDefault` marks the
   * error handled — the boundary is showing its fallback, so it is not "uncaught".
   */
  #attemptMount(): { ok: true } | { ok: false; message?: string; error?: unknown } {
    const view = this.#deps.ownerDocument.defaultView;
    let captured: { message: string; error: unknown } | undefined;
    const onError = (event: Event): void => {
      const errorEvent = event as ErrorEvent;
      captured = { message: errorEvent.message, error: errorEvent.error };
      event.preventDefault();
    };
    view?.addEventListener('error', onError);
    try {
      this.#deps.mounts.mount(this.#slot, this.#input);
    } catch (err) {
      view?.removeEventListener('error', onError);
      const message = errorMessage(err);
      return { ok: false, ...(message !== undefined ? { message } : {}), error: err };
    }
    view?.removeEventListener('error', onError);
    if (captured !== undefined) return { ok: false, ...captured };
    return { ok: true };
  }

  #onLoading = (): void => {
    this.#pendingSeen = true;
    if (this.#mountResolved && this.#state !== 'error') this.#toLoading();
  };

  #onReady = (): void => {
    if (this.#state === 'error' || this.#state === 'idle') return;
    this.#enterReady();
  };

  #onError = (event: CustomEvent<WidgetErrorDetail>): void => {
    const detail = event.detail;
    this.#enterError('reported', detail?.message, detail?.error ?? detail);
  };

  /** Enter (or stay in) the loading state and arm the latency budget. */
  #toLoading(): void {
    if (this.#state === 'error') return;
    this.#setState('loading');
    this.#startBudget();
  }

  /** Reveal the widget: hide the skeleton, stop the budget, report mount-to-ready latency once. */
  #enterReady(): void {
    if (this.#state === 'ready') return;
    this.#clearBudget();
    this.#setState('ready');
    if (!this.#settled) {
      this.#settled = true;
      this.#emit({
        type: 'widget.latency',
        ...this.#identity(),
        phase: 'settled',
        elapsedMs: this.#elapsed(),
        exceeded: false,
      });
    }
  }

  /** Fall back to the error card, unmount the widget, and report the failure. */
  #enterError(reason: WidgetFailureReason, message?: string, error?: unknown): void {
    if (this.#state === 'error') return;
    this.#clearBudget();
    // Unmount the tracked element (fires disconnectedCallback); if the mount threw
    // mid-connect the element was never tracked, so clear the slot to detach it.
    if (!this.#deps.mounts.unmount(this.#input.instanceId)) this.#slot.replaceChildren();
    this.#setState('error');
    this.#renderCard(reason);
    this.#emit({
      type: 'widget.error',
      ...this.#identity(),
      reason,
      ...(message !== undefined ? { message } : {}),
      ...(error !== undefined ? { error } : {}),
    });
  }

  /** Arm the latency-budget timer for a pending widget; idempotent (re-arms). */
  #startBudget(): void {
    this.#clearBudget();
    const budget = this.#deps.config().latencyBudgetMs;
    if (budget === undefined || budget <= 0) return;
    this.#budgetTimer = setTimeout(() => {
      this.#budgetTimer = undefined;
      if (this.#state !== 'loading') return;
      this.#emit({
        type: 'widget.latency',
        ...this.#identity(),
        phase: 'exceeded',
        elapsedMs: budget,
        budgetMs: budget,
        exceeded: true,
      });
      if (this.#deps.config().autoDegradeOnLatency === true) this.#enterError('timeout');
    }, budget);
  }

  #clearBudget(): void {
    if (this.#budgetTimer !== undefined) {
      clearTimeout(this.#budgetTimer);
      this.#budgetTimer = undefined;
    }
  }

  /** (Re)build the skeleton with the current display name and insert it after the slot. */
  #renderSkeleton(): void {
    this.#root.querySelector(`.${BOUNDARY_CLASS.skeleton}`)?.remove();
    const skeleton = createSkeleton(this.#deps.ownerDocument, this.#name());
    this.#slot.after(skeleton);
  }

  /** Build and insert the fallback card, wiring its retry to re-run the lifecycle. */
  #renderCard(reason: WidgetFailureReason): void {
    this.#removeCard();
    const card = createFallbackCard(this.#deps.ownerDocument, reason, this.#name());
    card.retry.addEventListener('click', this.#onRetry);
    this.#retryButton = card.retry;
    this.#root.appendChild(card.root);
  }

  #removeCard(): void {
    this.#root.querySelector(`.${BOUNDARY_CLASS.fallback}`)?.remove();
    this.#retryButton = undefined;
  }

  #onRetry = (): void => {
    this.#beginMount();
    // If the retry failed again, return focus to the fresh retry button so a
    // keyboard user is not stranded; on success, leave focus where it was.
    if (this.#state === 'error') this.#retryButton?.focus();
  };

  #setState(state: WidgetBoundaryState): void {
    this.#state = state;
    this.#root.dataset.gmState =
      state === 'idle' ? BOUNDARY_STATE.loading : BOUNDARY_STATE[state];
  }

  #emit(event: WidgetBoundaryEvent): void {
    this.#deps.config().telemetry?.(event);
  }

  #identity(): WidgetInstanceIdentity {
    return { instanceId: this.#input0.instanceId, widgetID: { ...this.#input0.widgetID } };
  }

  #name(): string | undefined {
    return this.#deps.config().describe?.(this.#identity());
  }

  #elapsed(): number {
    return Math.max(0, this.#deps.now() - this.#mountStart);
  }

  /** Whether the widget's custom-element tag is defined in the document's registry. */
  #tagDefined(): boolean {
    const view = this.#deps.ownerDocument.defaultView;
    const registry =
      view?.customElements ?? (typeof customElements !== 'undefined' ? customElements : undefined);
    // No registry to consult (unusual) — assume defined and let mount proceed.
    return registry === undefined || registry.get(this.#input.tag) !== undefined;
  }
}

/** A best-effort human message from a thrown value. */
function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}
