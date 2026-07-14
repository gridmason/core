/**
 * A tiny typed, DOM-free event emitter (docs/SPEC.md §2).
 *
 * The engine layer never touches the DOM — it operates on `LayoutDoc` JSON and
 * **emits change events** for the canvas (the only DOM consumer) to observe. So
 * the engine's event mechanism must not lean on DOM `EventTarget`/`CustomEvent`;
 * those are canvas-layer concerns. This is that mechanism: a synchronous,
 * framework-agnostic pub/sub over a typed event map, with zero DOM dependency.
 *
 * It is deliberately minimal — the engine's stateful surfaces (the widget
 * catalog, the page-type registry, the layout store) each own one and publish
 * their change events through it; a host or the canvas subscribes with
 * {@link Emitter.on}. Delivery is synchronous and in subscription order.
 */

/** A subscriber invoked with each emitted event of its type. */
export type Listener<Event> = (event: Event) => void;

/** Returned by {@link Emitter.on}/{@link Emitter.once}; call it to unsubscribe. Idempotent. */
export type Unsubscribe = () => void;

/**
 * A synchronous typed emitter over an event map — an object type (commonly an
 * `interface`) whose keys are the event names and whose values are the
 * corresponding event payload types.
 *
 * @typeParam EventMap - maps each event name to the payload {@link emit} carries
 *   and {@link on} receives, so subscription and emission are checked together.
 *   Left unconstrained so an `interface` event map (which lacks a `string` index
 *   signature) is accepted as readily as a `Record`.
 */
export class Emitter<EventMap> {
  /** Live listeners per event type. An empty set is pruned, so a present key always has ≥1 listener. */
  readonly #listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  /**
   * Subscribe `listener` to events of `type`. Returns an idempotent
   * {@link Unsubscribe} that removes exactly this subscription; the same
   * listener added twice is held once (set semantics).
   */
  on<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): Unsubscribe {
    let set = this.#listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      this.off(type, listener);
    };
  }

  /**
   * Subscribe `listener` for a single event of `type`, then auto-unsubscribe. The
   * listener is removed before it runs, so re-entrant emits from within it do not
   * re-invoke it. The returned {@link Unsubscribe} cancels it if it never fires.
   */
  once<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): Unsubscribe {
    const off = this.on(type, (event) => {
      off();
      listener(event);
    });
    return off;
  }

  /** Remove `listener` from `type`. A no-op if it was never subscribed. */
  off<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): void {
    const set = this.#listeners.get(type);
    if (set === undefined) return;
    set.delete(listener as Listener<never>);
    if (set.size === 0) this.#listeners.delete(type);
  }

  /**
   * Deliver `event` to every current `type` listener, synchronously and in
   * subscription order. Listeners are snapshotted first, so subscribing or
   * unsubscribing during delivery (e.g. {@link once}) does not affect this emit.
   */
  emit<K extends keyof EventMap>(type: K, event: EventMap[K]): void {
    const set = this.#listeners.get(type);
    if (set === undefined) return;
    for (const listener of [...set]) {
      (listener as Listener<EventMap[K]>)(event);
    }
  }

  /** How many listeners are currently subscribed to `type`. */
  listenerCount<K extends keyof EventMap>(type: K): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  /** Drop every subscription across all event types. */
  clear(): void {
    this.#listeners.clear();
  }
}
