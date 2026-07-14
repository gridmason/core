/**
 * The observable current-layout holder (docs/SPEC.md §2, §5) — the LayoutManager
 * half of the POC's two-manager split, hardened headless.
 *
 * {@link loadLayout} is a pure function; it has no state to observe. The
 * {@link LayoutStore} adds the small piece SPEC §2 asks of the engine: it holds
 * the page's current `LayoutDoc` and **emits a change event** whenever that
 * document changes, so the canvas (the only DOM consumer) can re-render off the
 * event rather than polling. It is deliberately thin: it stores and swaps whole
 * documents. It does **not** resolve governance layers (that is `resolveLayout`,
 * C-E2) and it does **not** compute granular edit-mode mutations (add/move/remove
 * a widget, C-E3) — the canvas computes a mutated document and hands it back via
 * {@link LayoutStore.replace}. DOM-free by contract (SPEC §2).
 */
import type { LayoutPage, VersionedLayout } from '@gridmason/protocol';

import { Emitter } from '../events/emitter.js';
import { loadLayout } from './load.js';
import type { LoadLayoutOptions, LoadLayoutResult } from './load.js';

/**
 * A document was loaded into the store via {@link LayoutStore.load}: the
 * migrate-on-read {@link LoadLayoutResult} it produced, whether loadable
 * (possibly migrated) or read-only-on-newer.
 */
export interface LayoutLoadedEvent {
  readonly type: 'layout:loaded';
  /** The load outcome; `result.readOnly` distinguishes a render-ready doc from a read-only one. */
  readonly result: LoadLayoutResult;
}

/**
 * The current document was replaced wholesale via {@link LayoutStore.replace} —
 * the write-back path for a canvas edit. Always a current-version, render-ready
 * {@link LayoutPage} (the caller owns the mutation; the store owns the state).
 */
export interface LayoutChangedEvent {
  readonly type: 'layout:changed';
  /** The new current document. */
  readonly doc: LayoutPage;
}

/**
 * A change to the store's current layout. Subscribe via {@link LayoutStore.events}.
 */
export type LayoutChangeEvent = LayoutLoadedEvent | LayoutChangedEvent;

/** The typed event map of {@link LayoutStore.events}, keyed by {@link LayoutChangeEvent} `type`. */
export interface LayoutStoreEventMap {
  'layout:loaded': LayoutLoadedEvent;
  'layout:changed': LayoutChangedEvent;
}

/**
 * Holds one page's current `LayoutDoc` and emits {@link LayoutChangeEvent}s when
 * it changes. Start empty; {@link load} a persisted document (migrate-on-read),
 * then {@link replace} it with edited versions. {@link current} is the
 * render-ready document, or `undefined` before any load or when the loaded
 * document is read-only-on-newer.
 */
export class LayoutStore {
  /**
   * Change events for the current layout (SPEC §2: the engine emits change
   * events; the canvas is the only DOM consumer). Emits {@link LayoutLoadedEvent}
   * on {@link load} and {@link LayoutChangedEvent} on {@link replace}.
   */
  readonly events: Emitter<LayoutStoreEventMap> = new Emitter<LayoutStoreEventMap>();

  /** The current render-ready document, or `undefined` (none loaded, or read-only). */
  #current: LayoutPage | undefined;
  /** Whether the last {@link load} yielded a read-only-on-newer document. */
  #readOnly = false;

  /**
   * Run {@link loadLayout} (migrate-on-read) on a persisted document, adopt the
   * result as the current state, and emit `layout:loaded`. A loadable result
   * becomes {@link current}; a read-only-on-newer result leaves {@link current}
   * `undefined` and sets {@link readOnly}. Returns the {@link LoadLayoutResult}
   * so the caller can drive write-back off `result.migrated`.
   */
  load(doc: VersionedLayout, options: LoadLayoutOptions = {}): LoadLayoutResult {
    const result = loadLayout(doc, options);
    if (result.readOnly) {
      this.#current = undefined;
      this.#readOnly = true;
    } else {
      this.#current = result.doc;
      this.#readOnly = false;
    }
    this.events.emit('layout:loaded', { type: 'layout:loaded', result });
    return result;
  }

  /**
   * Replace the current document wholesale with an edited, current-version
   * {@link LayoutPage} and emit `layout:changed`. Clears any read-only state; the
   * caller is asserting a render-ready document.
   */
  replace(doc: LayoutPage): void {
    this.#current = doc;
    this.#readOnly = false;
    this.events.emit('layout:changed', { type: 'layout:changed', doc });
  }

  /** The current render-ready document, or `undefined` before a load or when read-only. */
  get current(): LayoutPage | undefined {
    return this.#current;
  }

  /** Whether the last {@link load} produced a read-only-on-newer document. */
  get readOnly(): boolean {
    return this.#readOnly;
  }
}
