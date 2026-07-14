/**
 * The custom-element mount manager (docs/SPEC.md §4, FR-11) — the WidgetManager
 * half of the POC's two-manager split, hardened around one guarantee:
 *
 * > **`disconnectedCallback` runs before an instance is removed or re-mounted.**
 *
 * The manager owns the map from a layout instance id to its live widget element
 * and is the single place a widget element enters or leaves the DOM. Because it
 * removes an element from the document **synchronously** before it appends any
 * replacement, a widget's `disconnectedCallback` is always delivered before its
 * slot is reused — on a layout change, a tab switch, or a resolution-gate flip
 * (all of which reach the canvas as a new effective layout). This is DOM-only:
 * it knows nothing of gridstack. `PageCanvas` owns the grid geometry and calls
 * into this manager for every element mount/unmount so the guarantee holds in
 * one place.
 *
 * ## Widget cleanup contract (SPEC §4)
 *
 * A widget MUST release everything it allocated **outside** the SDK in its
 * `disconnectedCallback`: timers (`setInterval`/`setTimeout`), `IntersectionObserver`/
 * `ResizeObserver`/`MutationObserver` instances, and any listener it added to a
 * target it does not own (`window`, `document`, media queries). Event-bus
 * subscriptions made through the SDK handle are auto-released on unmount (sdk §3
 * rule 6), so a well-behaved widget's only cleanup burden is what it allocated
 * outside the SDK. The manager guarantees the callback *fires* (before removal or
 * re-mount); honoring it is the widget's responsibility.
 */
import type { WidgetAbiState, WidgetMountInput } from './abi.js';
import { applyAbiState, applyMountInput } from './abi.js';

/** A live, mounted widget element tracked by a {@link WidgetMountManager}. */
export interface MountedWidget {
  /** The layout instance id this element was mounted for. */
  readonly instanceId: string;
  /** The custom-element tag that was mounted. */
  readonly tag: string;
  /** The widget custom element itself (an unknown/undefined tag mounts as an unupgraded element). */
  readonly element: HTMLElement;
  /** The host container the element was appended into (a gridstack item content div, in `PageCanvas`). */
  readonly host: HTMLElement;
}

/** Options for constructing a {@link WidgetMountManager}. */
export interface WidgetMountManagerOptions {
  /**
   * The document used to create widget elements. Defaults to the ambient
   * `document`. Injectable so a test (or a canvas mounted in another document,
   * e.g. an `<iframe>`) can supply its own without touching a global.
   */
  readonly ownerDocument?: Document;
}

/**
 * Manages the mount/unmount lifecycle of widget custom elements, keyed by layout
 * instance id, upholding the `disconnectedCallback`-before-reuse guarantee
 * (SPEC §4). One instance backs one {@link PageCanvas}.
 */
export class WidgetMountManager {
  readonly #mounted = new Map<string, MountedWidget>();
  readonly #document: Document;

  constructor(options: WidgetMountManagerOptions = {}) {
    this.#document = options.ownerDocument ?? document;
  }

  /**
   * Mount a widget for `input.instanceId` into `host`: create the element, set
   * its ABI (attributes + opaque SDK handle) **before** insertion, then append
   * it — so the widget's `connectedCallback` sees a fully-configured element.
   *
   * @throws Error if an element is already mounted for `input.instanceId` — the
   *   caller must {@link unmount} or {@link remount} instead, which upholds the
   *   lifecycle guarantee. This refusal keeps a stale element from being orphaned
   *   (leaked, never disconnected) by an accidental double-mount.
   */
  mount(host: HTMLElement, input: WidgetMountInput): MountedWidget {
    if (this.#mounted.has(input.instanceId)) {
      throw new Error(
        `a widget is already mounted for instance '${input.instanceId}'; unmount or remount instead`,
      );
    }
    const element = this.#document.createElement(input.tag);
    applyMountInput(element, input);
    const mounted: MountedWidget = { instanceId: input.instanceId, tag: input.tag, element, host };
    // Insertion is the connect: appending a (defined) custom element to a
    // connected host synchronously runs its connectedCallback.
    host.appendChild(element);
    this.#mounted.set(input.instanceId, mounted);
    return mounted;
  }

  /**
   * Re-mount an instance from scratch: if one is currently mounted, {@link unmount}
   * it first (removing it from the DOM, firing its `disconnectedCallback`), then
   * {@link mount} the new element. The tear-down happens **before** the new
   * element is created and inserted, so the guarantee holds for the identity /
   * tag change that requires a fresh element.
   */
  remount(host: HTMLElement, input: WidgetMountInput): MountedWidget {
    this.unmount(input.instanceId);
    return this.mount(host, input);
  }

  /**
   * Update a mounted widget's mutable ABI ({@link WidgetAbiState}: context,
   * settings, edit-mode) **in place**, without a re-mount — so a context change
   * or an edit-mode toggle never tears the widget down and loses its state. A
   * no-op if nothing is mounted for `instanceId`.
   *
   * @returns `true` if a mounted widget was updated, `false` if none was found.
   */
  updateAbiState(instanceId: string, state: WidgetAbiState): boolean {
    const mounted = this.#mounted.get(instanceId);
    if (mounted === undefined) return false;
    applyAbiState(mounted.element, state);
    return true;
  }

  /**
   * Unmount the widget for `instanceId`: remove its element from the DOM —
   * synchronously firing its `disconnectedCallback` — and stop tracking it. A
   * no-op if none is mounted.
   *
   * @returns `true` if a widget was unmounted, `false` if none was mounted.
   */
  unmount(instanceId: string): boolean {
    const mounted = this.#mounted.get(instanceId);
    if (mounted === undefined) return false;
    this.#mounted.delete(instanceId);
    // remove() detaches the element from the document, delivering
    // disconnectedCallback synchronously; a no-op if already detached.
    mounted.element.remove();
    return true;
  }

  /**
   * Unmount every tracked widget (each firing its `disconnectedCallback`) and
   * clear the manager. Used by {@link PageCanvas} teardown; safe to call twice.
   */
  unmountAll(): void {
    for (const instanceId of [...this.#mounted.keys()]) {
      this.unmount(instanceId);
    }
  }

  /** The widget currently mounted for `instanceId`, or `undefined`. */
  get(instanceId: string): MountedWidget | undefined {
    return this.#mounted.get(instanceId);
  }

  /** Whether a widget is currently mounted for `instanceId`. */
  has(instanceId: string): boolean {
    return this.#mounted.has(instanceId);
  }

  /** The instance ids currently mounted, in mount order. */
  get instanceIds(): readonly string[] {
    return [...this.#mounted.keys()];
  }

  /** How many widgets are currently mounted. */
  get size(): number {
    return this.#mounted.size;
  }
}
