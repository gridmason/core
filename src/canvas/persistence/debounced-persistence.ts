/**
 * `DebouncedLayoutPersistence` — a {@link LayoutPersistencePort} decorator that
 * coalesces a burst of rapid layout writes into a **single** trailing write
 * (docs/SPEC.md §7, FR-15 — "debounce layout writes").
 *
 * During an edit gesture the canvas can emit many layout mutations in quick
 * succession: a drag or resize settles into a stream of `gm:geometry-change`
 * events, and {@link EditController} persists on every commit. Writing each
 * intermediate frame to the host's persistence adapter is wasteful (and, for a
 * networked host adapter, a burst of redundant round-trips). This decorator sits
 * between the controller and the host adapter: each {@link put} records the
 * **latest** document for its {@link ScopeKey} and (re)arms a short timer; only
 * when the burst goes quiet for `delayMs` does the single most-recent document
 * flush through to the wrapped adapter. Distinct scope keys are coalesced
 * independently — a write to one page never delays another's.
 *
 * The decorator is a pure canvas-layer concern: it makes **no network call**
 * itself (SPEC §1) — it defers an adapter hop, nothing more. A host wraps its own
 * adapter (`new DebouncedLayoutPersistence(adapter)`) and passes the result to
 * {@link EditController} as `persistence`; the controller is unchanged. Because a
 * trailing debounce drops the in-flight write until the timer fires, a host that
 * needs a durable write at a boundary (blur, navigation, edit-mode exit) calls
 * {@link flush} to force every pending document out immediately.
 */
import { scopeKeyString } from '../../engine/layout/index.js';
import type { ScopeKey } from '../../engine/layout/index.js';
import type { LayoutPage } from '@gridmason/protocol';

import type { LayoutPersistencePort } from '../edit-mode/index.js';

/** An opaque timer handle — a Node `Timeout` or a browser numeric id. */
type TimerHandle = ReturnType<typeof setTimeout>;

/** Tunable, injectable behaviour for a {@link DebouncedLayoutPersistence}. */
export interface DebouncedLayoutPersistenceOptions {
  /**
   * Quiet-window in milliseconds a burst must be idle before its latest document
   * flushes. Defaults to {@link DEFAULT_DEBOUNCE_MS}. A larger window coalesces
   * more aggressively; a smaller one persists sooner.
   */
  readonly delayMs?: number;
  /**
   * Optional cap (ms) on how long a **continuous** burst may defer a write: once a
   * scope key has waited this long since its first un-flushed write, its next
   * `put` flushes immediately instead of re-arming. Bounds worst-case data loss on
   * an unbroken drag. Omitted (the default) means a pure trailing debounce with no
   * cap.
   */
  readonly maxWaitMs?: number;
  /** Timer scheduler; defaults to `setTimeout`. Injectable for deterministic tests. */
  readonly schedule?: (callback: () => void, ms: number) => TimerHandle;
  /** Timer canceller; defaults to `clearTimeout`. Must pair with {@link schedule}. */
  readonly cancel?: (handle: TimerHandle) => void;
  /** Monotonic clock (ms) for the {@link maxWaitMs} cap; defaults to `performance.now()` / `Date.now()`. */
  readonly now?: () => number;
}

/** Default quiet-window: long enough to swallow a drag/resize burst, short enough to feel immediate. */
export const DEFAULT_DEBOUNCE_MS = 200;

/** The default monotonic clock: `performance.now()` when available, else `Date.now()`. */
function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** A scope key's pending write: its full key, the latest document, and when the burst began. */
interface Pending {
  readonly key: ScopeKey;
  layout: LayoutPage;
  timer: TimerHandle | undefined;
  firstAt: number;
}

export class DebouncedLayoutPersistence implements LayoutPersistencePort {
  readonly #inner: LayoutPersistencePort;
  readonly #delayMs: number;
  readonly #maxWaitMs: number | undefined;
  readonly #schedule: (callback: () => void, ms: number) => TimerHandle;
  readonly #cancel: (handle: TimerHandle) => void;
  readonly #now: () => number;

  /** Latest un-flushed document per canonical scope-key string. */
  readonly #pending = new Map<string, Pending>();

  constructor(inner: LayoutPersistencePort, options: DebouncedLayoutPersistenceOptions = {}) {
    this.#inner = inner;
    this.#delayMs = options.delayMs ?? DEFAULT_DEBOUNCE_MS;
    this.#maxWaitMs = options.maxWaitMs;
    this.#schedule = options.schedule ?? ((cb, ms) => setTimeout(cb, ms));
    this.#cancel = options.cancel ?? ((h) => clearTimeout(h));
    this.#now = options.now ?? defaultNow;
  }

  /** Whether any scope key has an un-flushed write scheduled. */
  get pending(): boolean {
    return this.#pending.size > 0;
  }

  /**
   * Record `layout` as the latest document for `key` and (re)arm its debounce
   * timer, replacing any earlier pending document for the same key. If the
   * {@link DebouncedLayoutPersistenceOptions.maxWaitMs} cap has elapsed since the
   * key's first pending write, flush it now instead of deferring further.
   */
  put(key: ScopeKey, layout: LayoutPage): void {
    const id = scopeKeyString(key);
    const existing = this.#pending.get(id);

    if (existing === undefined) {
      const entry: Pending = { key, layout, timer: undefined, firstAt: this.#now() };
      this.#pending.set(id, entry);
      entry.timer = this.#arm(id);
      return;
    }

    existing.layout = layout;
    if (this.#maxWaitMs !== undefined && this.#now() - existing.firstAt >= this.#maxWaitMs) {
      this.#flushEntry(id);
      return;
    }
    if (existing.timer !== undefined) this.#cancel(existing.timer);
    existing.timer = this.#arm(id);
  }

  /**
   * Flush pending writes immediately. With no argument, every pending scope key's
   * latest document is written through to the wrapped adapter now; with a `key`,
   * only that scope key flushes. A no-op for a key with nothing pending.
   */
  flush(key?: ScopeKey): void {
    if (key !== undefined) {
      this.#flushEntry(scopeKeyString(key));
      return;
    }
    for (const id of [...this.#pending.keys()]) this.#flushEntry(id);
  }

  /**
   * Drop every pending write without persisting it and cancel all timers. Used
   * when an edit session is abandoned; the wrapped adapter is left untouched.
   */
  cancel(): void {
    for (const entry of this.#pending.values()) {
      if (entry.timer !== undefined) this.#cancel(entry.timer);
    }
    this.#pending.clear();
  }

  /** Arm a debounce timer for `id`; on fire, flush that entry through to the adapter. */
  #arm(id: string): TimerHandle {
    return this.#schedule(() => this.#flushEntry(id), this.#delayMs);
  }

  /** Flush one pending entry (if any) through to the wrapped adapter and forget it. */
  #flushEntry(id: string): void {
    const entry = this.#pending.get(id);
    if (entry === undefined) return;
    if (entry.timer !== undefined) this.#cancel(entry.timer);
    this.#pending.delete(id);
    void this.#inner.put(entry.key, entry.layout);
  }
}
