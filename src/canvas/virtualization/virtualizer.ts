/**
 * `CanvasVirtualizer` — offscreen-widget virtualization for a long page
 * (docs/SPEC.md §7, FR-15 — "virtualize offscreen widgets on long pages").
 *
 * On a page with many widgets, mounting every one up front is wasteful: most are
 * scrolled out of view. This helper watches each placed grid item with an
 * `IntersectionObserver` and drives two callbacks — {@link CanvasVirtualizerCallbacks.mount}
 * when an item scrolls **near** the viewport, {@link CanvasVirtualizerCallbacks.unmount}
 * when it leaves — so a widget is only mounted while it is (nearly) on screen and
 * is torn down when it isn't. The near-viewport band ({@link CanvasVirtualizerOptions.rootMargin})
 * mounts a widget slightly before it becomes visible, so scrolling reveals a
 * ready widget rather than a blank cell. The interactive cost of a page stays
 * bounded by what fits on screen, regardless of how many widgets the layout has.
 *
 * The virtualizer owns **only the observe/decide** logic; the actual DOM
 * mount/unmount lives in {@link PageCanvas} (through its boundary manager), so the
 * SPEC §4 disconnect-before-reuse lifecycle guarantee still runs in one place —
 * an unmount fired here goes through the same boundary teardown as any other, so
 * a virtualized widget's `disconnectedCallback` is honored on exit.
 *
 * The `IntersectionObserver` is injectable ({@link CanvasVirtualizerOptions.createObserver})
 * so a unit test can drive intersection deterministically and a host can pin a
 * custom scroll root; the default wraps the global `IntersectionObserver`. Where
 * no `IntersectionObserver` exists at all, the default degrades safely to eager
 * mounting (every observed item mounts at once) — correctness never depends on
 * virtualization being available.
 */

/** The mount/unmount actions the virtualizer drives as items enter and leave the near-viewport band. */
export interface CanvasVirtualizerCallbacks {
  /** Mount the widget for `instanceId` (it has scrolled near the viewport). Idempotent-safe: called only on a not-mounted → mounted transition. */
  mount(instanceId: string): void;
  /** Unmount the widget for `instanceId` (it has left the near-viewport band). Called only on a mounted → not-mounted transition. */
  unmount(instanceId: string): void;
}

/** One observed target's intersection state — the minimal slice of `IntersectionObserverEntry` the virtualizer reads. */
export interface VirtualizerObserverEntry {
  /** The observed element. */
  readonly target: Element;
  /** Whether the element is intersecting the (margin-expanded) root. */
  readonly isIntersecting: boolean;
}

/** The observe/unobserve/disconnect surface the virtualizer needs — a structural slice of `IntersectionObserver`. */
export interface VirtualizerObserver {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

/** Builds the {@link VirtualizerObserver} that reports intersection changes to `callback`. */
export type VirtualizerObserverFactory = (
  callback: (entries: readonly VirtualizerObserverEntry[]) => void,
) => VirtualizerObserver;

/** Tunable, injectable behaviour for a {@link CanvasVirtualizer}. */
export interface CanvasVirtualizerOptions {
  /**
   * The near-viewport band grown around the scroll root, as a CSS `rootMargin`
   * (e.g. `'256px'`). A widget within this band of the viewport is mounted so
   * scrolling reveals a ready widget. Defaults to {@link DEFAULT_ROOT_MARGIN}.
   * Ignored when {@link createObserver} is supplied.
   */
  readonly rootMargin?: string;
  /** Injectable observer factory (tests / a custom scroll root). Defaults to a global-`IntersectionObserver` wrapper. */
  readonly createObserver?: VirtualizerObserverFactory;
}

/** Default near-viewport band: mount widgets within ~one viewport-eighth of becoming visible. */
export const DEFAULT_ROOT_MARGIN = '256px';

/**
 * Default observer factory: wrap the global `IntersectionObserver` with
 * `rootMargin`. Where the global is absent (a non-browser or stripped-down
 * environment), fall back to an eager observer that mounts every observed target
 * immediately and never unmounts — virtualization off, correctness intact.
 */
function defaultObserverFactory(rootMargin: string): VirtualizerObserverFactory {
  return (callback) => {
    if (typeof IntersectionObserver === 'undefined') {
      return {
        observe: (target) => callback([{ target, isIntersecting: true }]),
        unobserve: () => {},
        disconnect: () => {},
      };
    }
    return new IntersectionObserver(
      (entries) =>
        callback(entries.map((e) => ({ target: e.target, isIntersecting: e.isIntersecting }))),
      { rootMargin },
    );
  };
}

export class CanvasVirtualizer {
  readonly #callbacks: CanvasVirtualizerCallbacks;
  readonly #observer: VirtualizerObserver;

  /** instanceId → observed target, and the reverse, so an intersection entry resolves to its instance. */
  readonly #targets = new Map<string, Element>();
  readonly #ids = new WeakMap<Element, string>();
  /** Instances whose widget is currently mounted (intersecting). */
  readonly #mounted = new Set<string>();

  constructor(callbacks: CanvasVirtualizerCallbacks, options: CanvasVirtualizerOptions = {}) {
    this.#callbacks = callbacks;
    const factory = options.createObserver ?? defaultObserverFactory(options.rootMargin ?? DEFAULT_ROOT_MARGIN);
    this.#observer = factory((entries) => this.#onIntersect(entries));
  }

  /**
   * Track `target` (the grid item element) for `instanceId` and start observing
   * it. The widget is not mounted until the observer reports the target near the
   * viewport. Observing an already-tracked instance re-points it at `target`.
   */
  observe(instanceId: string, target: Element): void {
    const prev = this.#targets.get(instanceId);
    if (prev !== undefined && prev !== target) {
      this.#observer.unobserve(prev);
      this.#ids.delete(prev);
    }
    this.#targets.set(instanceId, target);
    this.#ids.set(target, instanceId);
    this.#observer.observe(target);
  }

  /**
   * Stop tracking `instanceId` (its grid item is being removed from the layout).
   * Does **not** fire the unmount callback — the caller is removing the item and
   * owns its teardown; this only drops the virtualizer's bookkeeping.
   */
  unobserve(instanceId: string): void {
    const target = this.#targets.get(instanceId);
    if (target !== undefined) {
      this.#observer.unobserve(target);
      this.#ids.delete(target);
    }
    this.#targets.delete(instanceId);
    this.#mounted.delete(instanceId);
  }

  /** Stop observing everything and drop all bookkeeping. Fires no callbacks (used on canvas teardown). */
  disconnect(): void {
    this.#observer.disconnect();
    this.#targets.clear();
    this.#mounted.clear();
  }

  /** The instances currently considered on-screen (mounted), in no particular order. */
  get mountedIds(): readonly string[] {
    return [...this.#mounted];
  }

  /** Whether the widget for `instanceId` is currently mounted (on screen). */
  isMounted(instanceId: string): boolean {
    return this.#mounted.has(instanceId);
  }

  /** Translate intersection changes into mount/unmount transitions, one per changed instance. */
  #onIntersect(entries: readonly VirtualizerObserverEntry[]): void {
    for (const entry of entries) {
      const instanceId = this.#ids.get(entry.target);
      if (instanceId === undefined) continue; // a stale entry for an already-unobserved target
      const mounted = this.#mounted.has(instanceId);
      if (entry.isIntersecting && !mounted) {
        this.#mounted.add(instanceId);
        this.#callbacks.mount(instanceId);
      } else if (!entry.isIntersecting && mounted) {
        this.#mounted.delete(instanceId);
        this.#callbacks.unmount(instanceId);
      }
    }
  }
}
