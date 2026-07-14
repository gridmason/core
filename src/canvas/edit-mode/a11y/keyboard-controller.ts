/**
 * The canvas keyboard alternative + a11y controller (docs/SPEC.md §2, §7, FR-9):
 * the input layer that gives **every** pointer edit a keyboard-only path and
 * narrates it to assistive tech, so the canvas holds WCAG 2.1 AA in edit mode.
 *
 * It adds **no** mutation logic of its own. A move or resize is translated into a
 * {@link CANVAS_GEOMETRY_CHANGE_EVENT} — the exact event a settled pointer drag
 * fires — so the {@link EditController} folds it into the layout, forks
 * copy-on-write, and persists through the same port. Add / remove / tab
 * operations call straight through to the controller's public methods. This
 * controller only decides *which* operation a key press means, keeps the
 * move-mode + focus state, and speaks the result through a {@link LiveAnnouncer}.
 *
 * ## Interaction model (move-mode)
 *
 * A grid item is a focusable landmark (`role="group"`, `aria-roledescription`,
 * an accessible name, `tabindex="0"`). With one focused:
 * - **Enter / Space** — enter *move-mode* on it (announced with its controls).
 * - In move-mode: **arrow keys** move one cell; **Shift + arrow keys** resize one
 *   cell; **Enter / Space** drops; **Escape** cancels and restores the pre-mode
 *   placement. Each step commits and persists (debouncing is the sibling perf
 *   issue #21) and is announced by cell.
 * - **Delete / Backspace** (not in move-mode) — remove the focused widget if
 *   governance allows; a locked slot is refused and announced.
 *
 * Add and tab operations are host-toolbar-driven (core owns no picker/tab-bar
 * chrome), so they are exposed as methods ({@link add}, {@link switchTab},
 * {@link addTab}) that route the same commit + announcement path.
 *
 * ## Focus safety
 *
 * On every canvas render ({@link CANVAS_RENDERED_EVENT}) the controller re-applies
 * landmarks and, if the focused widget was just removed or unmounted by a tab
 * switch, moves focus to a stable neighbour — so focus is never stranded on a
 * detached node (the C-E3 lifecycle guarantee, SPEC §4).
 *
 * Virtualization (#21) mounts and unmounts widgets *between* renders as the page
 * scrolls, so the controller also listens for the per-widget
 * {@link CANVAS_WIDGET_MOUNTED_EVENT} — landmark the newly-mounted item so a
 * scrolled-in widget is keyboard-reachable at once, not only after some later
 * full render — and {@link CANVAS_WIDGET_UNMOUNTED_EVENT} — rescue focus if the
 * scrolled-out widget held it, then drop its landmark. A landmark tracks mount
 * state: an offscreen, torn-down widget is not a Tab stop, and regains its
 * landmark when it scrolls back in.
 */
import type { AddWidgetInput } from '../edit-controller.js';
import {
  CANVAS_GEOMETRY_CHANGE_EVENT,
  CANVAS_RENDERED_EVENT,
  CANVAS_WIDGET_MOUNTED_EVENT,
  CANVAS_WIDGET_UNMOUNTED_EVENT,
} from '../../PageCanvas/index.js';
import type {
  CanvasGeometryChangeDetail,
  CanvasWidgetLifecycleDetail,
  WidgetGeometry,
} from '../../PageCanvas/index.js';
import type { LayoutWidget, GridSize } from '@gridmason/protocol';

import type { GridRect } from '../../../engine/placement/index.js';

import type { LiveAnnouncer } from './announcer.js';
import * as say from './announcements.js';
import {
  DEFAULT_MIN_SIZE,
  arrowDirection,
  moveRect,
  resizeRect,
  sameRect,
} from './geometry.js';
import type { GridBounds } from './geometry.js';

/**
 * The slice of the {@link EditController} this controller drives — its public
 * edit surface. `EditController` satisfies it structurally, so the a11y layer
 * never re-implements a mutation; it delegates and lets the controller fork and
 * persist.
 */
export interface KeyboardEditTarget {
  /** Whether the canvas is currently in edit mode (keys are inert otherwise). */
  readonly editing: boolean;
  /** Whether `instanceId` may be removed (exists, editable, unlocked). */
  canRemove(instanceId: string): boolean;
  /** Whether `instanceId` sits in a locked slot (no move/resize/remove). */
  isLocked(instanceId: string): boolean;
  /** Remove `instanceId`; `false` if absent or locked. */
  removeWidget(instanceId: string): boolean;
  /** Add a widget instance, placed by first-fit; returns the created item. */
  addWidget(input: AddWidgetInput): LayoutWidget;
  /** Append a new empty tab. */
  addTab(name: string): void;
  /** Switch the active tab (a view change). */
  switchTab(index: number): void;
}

/**
 * The slice of the {@link PageCanvas} this controller reads and decorates: an
 * `EventTarget` (for keydown/focusin/render + dispatching geometry changes) plus
 * the item lookups. `PageCanvas` satisfies it structurally.
 */
export interface KeyboardEditCanvas extends EventTarget {
  /** Instance ids currently placed on the active grid, in mount order. */
  readonly mountedInstanceIds: readonly string[];
  /** Live `{x,y,w,h,i}` of a placed instance, read from gridstack. */
  geometryOf(instanceId: string): WidgetGeometry | undefined;
  /** The gridstack item element for `instanceId` (the focus/landmark target). */
  itemElement(instanceId: string): HTMLElement | undefined;
}

/** Everything a {@link CanvasKeyboardController} needs to drive one canvas's keyboard/a11y layer. */
export interface CanvasKeyboardControllerOptions {
  /** The canvas being made keyboard-accessible. */
  readonly canvas: KeyboardEditCanvas;
  /** The edit controller whose commit paths every keyboard op drives. */
  readonly controller: KeyboardEditTarget;
  /** The live region announcements are spoken through. */
  readonly announcer: LiveAnnouncer;
  /** Grid column count, for clamping moves/resizes to the grid. Defaults to 12. */
  readonly columns?: number;
  /** Minimum widget footprint `[w,h]` a resize will not shrink past. Defaults to `[1,1]`. */
  readonly minSize?: GridSize;
  /**
   * Resolve a widget instance's accessible name (its landmark label and the name
   * used in announcements). Defaults to the item's existing `aria-label`, else a
   * generic "Widget".
   */
  readonly labelFor?: (instanceId: string) => string;
}

/** Default grid column count when a layout does not pin one (SPEC §3 `maxColumns`). */
const DEFAULT_COLUMNS = 12;

/**
 * Attaches to a {@link KeyboardEditCanvas} + {@link KeyboardEditTarget} and turns
 * key presses into keyboard-accessible, announced edit operations. Construct one
 * per edit session; call {@link dispose} to detach.
 */
export class CanvasKeyboardController {
  readonly #canvas: KeyboardEditCanvas;
  readonly #controller: KeyboardEditTarget;
  readonly #announcer: LiveAnnouncer;
  readonly #columns: number;
  readonly #minSize: GridSize;
  readonly #labelFor: ((instanceId: string) => string) | undefined;

  /** The focused widget's instance id, or `undefined` when focus is elsewhere. */
  #focusedId: string | undefined;
  /** Index of the focused id among mounted items when it was focused — the slot to rescue focus to. */
  #focusedIndex = 0;
  /** The instance being moved in move-mode, or `undefined` when not in move-mode. */
  #moveSubject: string | undefined;
  /** The placement move-mode began at, for Escape to restore. */
  #moveOrigin: GridRect | undefined;

  constructor(options: CanvasKeyboardControllerOptions) {
    this.#canvas = options.canvas;
    this.#controller = options.controller;
    this.#announcer = options.announcer;
    this.#columns = options.columns ?? DEFAULT_COLUMNS;
    this.#minSize = options.minSize ?? DEFAULT_MIN_SIZE;
    this.#labelFor = options.labelFor;

    this.#canvas.addEventListener('keydown', this.#onKeydown);
    this.#canvas.addEventListener('focusin', this.#onFocusIn);
    this.#canvas.addEventListener(CANVAS_RENDERED_EVENT, this.#onRendered);
    this.#canvas.addEventListener(CANVAS_WIDGET_MOUNTED_EVENT, this.#onWidgetMounted);
    this.#canvas.addEventListener(CANVAS_WIDGET_UNMOUNTED_EVENT, this.#onWidgetUnmounted);
    // Decorate whatever is already rendered so the first Tab lands on a landmark.
    this.#applyLandmarks();
  }

  /** Whether a widget is currently in keyboard move-mode. */
  get inMoveMode(): boolean {
    return this.#moveSubject !== undefined;
  }

  /** The focused widget's instance id, or `undefined`. */
  get focusedInstanceId(): string | undefined {
    return this.#focusedId;
  }

  /** Programmatically focus a widget's landmark (also used by hosts after an add). */
  focus(instanceId: string): void {
    this.#focusItem(instanceId);
  }

  /**
   * Add a widget through the edit controller, announce it, and focus the new
   * instance. `name` overrides the announced label (a host passes the picker's
   * display name). Returns the created item.
   */
  add(input: AddWidgetInput, name?: string): LayoutWidget {
    const item = this.#controller.addWidget(input);
    this.#announcer.announce(say.widgetAdded(name ?? this.#nameFor(item.i)));
    this.#focusItem(item.i);
    return item;
  }

  /**
   * Remove a widget through the edit controller, announcing the result. A locked
   * or non-removable instance is refused and announced; focus is rescued to a
   * neighbour by the render that follows a successful removal.
   */
  remove(instanceId: string): boolean {
    const name = this.#nameFor(instanceId);
    if (!this.#controller.canRemove(instanceId)) {
      this.#announcer.announce(
        this.#controller.isLocked(instanceId) ? say.lockedRefused(name) : say.removeRefused(name),
      );
      return false;
    }
    const removed = this.#controller.removeWidget(instanceId);
    if (removed) this.#announcer.announce(say.widgetRemoved(name));
    return removed;
  }

  /** Switch the active tab and announce it. `name` is the tab's display name for the announcement. */
  switchTab(index: number, name?: string): void {
    this.#controller.switchTab(index);
    this.#announcer.announce(say.tabSwitched(name ?? `tab ${index + 1}`));
  }

  /** Append a new tab and announce it. */
  addTab(name: string): void {
    this.#controller.addTab(name);
    this.#announcer.announce(say.tabAdded(name));
  }

  /** Detach every canvas listener. Call when the edit session ends. */
  dispose(): void {
    this.#canvas.removeEventListener('keydown', this.#onKeydown);
    this.#canvas.removeEventListener('focusin', this.#onFocusIn);
    this.#canvas.removeEventListener(CANVAS_RENDERED_EVENT, this.#onRendered);
    this.#canvas.removeEventListener(CANVAS_WIDGET_MOUNTED_EVENT, this.#onWidgetMounted);
    this.#canvas.removeEventListener(CANVAS_WIDGET_UNMOUNTED_EVENT, this.#onWidgetUnmounted);
  }

  /** Route a key press to the operation it means, when the canvas is in edit mode and a widget is focused. */
  readonly #onKeydown = (event: Event): void => {
    if (!this.#controller.editing) return;
    const e = event as KeyboardEvent;
    const id = this.#focusedId;
    if (id === undefined) return;

    if (this.#moveSubject !== undefined) {
      this.#handleMoveModeKey(e, this.#moveSubject);
      return;
    }

    if (isActivate(e.key)) {
      if (this.#controller.isLocked(id)) {
        this.#announcer.announce(say.lockedRefused(this.#nameFor(id)));
      } else {
        this.#enterMoveMode(id);
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.remove(id);
      e.preventDefault();
    }
  };

  /** Handle a key while in move-mode: arrows move/resize, Enter/Space drop, Escape cancel. */
  #handleMoveModeKey(e: KeyboardEvent, id: string): void {
    const direction = arrowDirection(e.key);
    if (direction !== undefined) {
      if (e.shiftKey) this.#resizeFocused(id, direction);
      else this.#moveFocused(id, direction);
      e.preventDefault();
      return;
    }
    if (isActivate(e.key)) {
      this.#dropMoveMode(id);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.#cancelMoveMode(id);
      e.preventDefault();
    }
  }

  /** Enter move-mode on `id`: remember where it started and announce the controls. */
  #enterMoveMode(id: string): void {
    const geo = this.#canvas.geometryOf(id);
    if (geo === undefined) return;
    this.#moveSubject = id;
    this.#moveOrigin = { x: geo.x, y: geo.y, w: geo.w, h: geo.h };
    this.#canvas.itemElement(id)?.setAttribute('data-gm-move-mode', 'true');
    this.#announcer.announce(say.moveModeEntered(this.#nameFor(id)));
  }

  /** Move the focused widget one cell; commit + announce only if the clamp let it move. */
  #moveFocused(id: string, direction: Parameters<typeof moveRect>[1]): void {
    const geo = this.#canvas.geometryOf(id);
    if (geo === undefined) return;
    const next = moveRect(geo, direction, this.#bounds());
    if (sameRect(next, geo)) return;
    this.#commitGeometry(id, next);
    this.#announcer.announce(say.movedTo(next.x, next.y));
  }

  /** Resize the focused widget one cell; commit + announce only if the clamp let it change. */
  #resizeFocused(id: string, direction: Parameters<typeof resizeRect>[1]): void {
    const geo = this.#canvas.geometryOf(id);
    if (geo === undefined) return;
    const next = resizeRect(geo, direction, this.#bounds());
    if (sameRect(next, geo)) return;
    this.#commitGeometry(id, next);
    this.#announcer.announce(say.resizedTo(next.w, next.h));
  }

  /** Drop move-mode: keep the current placement, clear the mode, announce where it landed. */
  #dropMoveMode(id: string): void {
    const geo = this.#canvas.geometryOf(id);
    this.#clearMoveMode(id);
    if (geo !== undefined) this.#announcer.announce(say.dropped(this.#nameFor(id), geo.x, geo.y));
  }

  /** Cancel move-mode: restore the pre-mode placement, clear the mode, announce the cancel. */
  #cancelMoveMode(id: string): void {
    const origin = this.#moveOrigin;
    this.#clearMoveMode(id);
    if (origin !== undefined) this.#commitGeometry(id, origin);
    this.#announcer.announce(say.moveCancelled(this.#nameFor(id)));
  }

  /** Leave move-mode and drop its per-item marker. */
  #clearMoveMode(id: string): void {
    this.#moveSubject = undefined;
    this.#moveOrigin = undefined;
    this.#canvas.itemElement(id)?.removeAttribute('data-gm-move-mode');
  }

  /**
   * Commit a new placement for `id` down the **same** path a pointer drag uses:
   * dispatch a geometry-change event carrying only this item's rect (the edit
   * controller keeps every other item as-is). It folds it into the layout, forks
   * on first edit, and persists — no mutation happens here.
   */
  #commitGeometry(id: string, rect: GridRect): void {
    this.#canvas.dispatchEvent(
      new CustomEvent<CanvasGeometryChangeDetail>(CANVAS_GEOMETRY_CHANGE_EVENT, {
        detail: { geometry: [{ i: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h }] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Track focus entering a widget landmark, so key presses know their subject. */
  readonly #onFocusIn = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest('[data-gm-instance]');
    const id = item?.getAttribute('data-gm-instance') ?? undefined;
    if (id === undefined) return;
    // Tabbing to a different widget while moving one drops the move as-is.
    if (this.#moveSubject !== undefined && this.#moveSubject !== id) this.#dropMoveMode(this.#moveSubject);
    this.#focusedId = id;
    this.#focusedIndex = this.#canvas.mountedInstanceIds.indexOf(id);
  };

  /** After a render, re-apply landmarks and rescue focus if the focused widget vanished. */
  readonly #onRendered = (): void => {
    this.#applyLandmarks();
    this.#rescueFocus();
  };

  /**
   * A widget the virtualizer mounted lazily (scrolled into view) between renders:
   * landmark it immediately so it becomes focusable/tab-reachable, instead of
   * staying invisible to the keyboard until an unrelated full render (the bug this
   * closes).
   */
  readonly #onWidgetMounted = (event: Event): void => {
    const id = (event as CustomEvent<CanvasWidgetLifecycleDetail>).detail?.instanceId;
    if (id === undefined) return;
    this.#applyLandmark(id);
  };

  /**
   * A widget the virtualizer unmounted lazily (scrolled out of view). A landmark
   * tracks mount state — an offscreen, torn-down widget is not a keyboard target —
   * so drop its landmark. First rescue focus (if this widget held it) *while its
   * landmark is still present*, so {@link #focusStranded} can recognise the
   * stranded focus and move it to a live neighbour; only then strip the landmark.
   * {@link #rescueFocus} no-ops when the focused widget is still mounted, so an
   * unrelated scroll-out costs only the strip. The widget regains its landmark
   * when it scrolls back in ({@link CANVAS_WIDGET_MOUNTED_EVENT}).
   */
  readonly #onWidgetUnmounted = (event: Event): void => {
    const id = (event as CustomEvent<CanvasWidgetLifecycleDetail>).detail?.instanceId;
    if (id === undefined) return;
    this.#rescueFocus();
    this.#removeLandmark(id);
  };

  /** Make every current grid item a focusable, named landmark for keyboard navigation. */
  #applyLandmarks(): void {
    for (const id of this.#canvas.mountedInstanceIds) this.#applyLandmark(id);
  }

  /** Make one grid item a focusable, named landmark (idempotent). */
  #applyLandmark(id: string): void {
    const el = this.#canvas.itemElement(id);
    if (el === undefined) return;
    el.setAttribute('data-gm-instance', id);
    if (el.getAttribute('tabindex') === null) el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', this.#nameFor(id));
  }

  /**
   * Strip the keyboard landmark this controller applied (its `data-gm-instance` /
   * `tabindex` / `aria-label`), taking a virtualized-away item out of the Tab
   * order. Leaves the canvas-owned `role`/`aria-roledescription` alone. A no-op if
   * the item element is gone.
   */
  #removeLandmark(id: string): void {
    const el = this.#canvas.itemElement(id);
    if (el === undefined) return;
    el.removeAttribute('data-gm-instance');
    el.removeAttribute('tabindex');
    el.removeAttribute('aria-label');
  }

  /**
   * If the focused widget is no longer mounted (removed, or unmounted by a tab
   * switch) and focus was left stranded on the detached node or the body, move
   * focus to the item now in its slot — never leaving focus on a detached node.
   */
  #rescueFocus(): void {
    const ids = this.#canvas.mountedInstanceIds;
    if (this.#moveSubject !== undefined && !ids.includes(this.#moveSubject)) this.#clearMoveMode(this.#moveSubject);
    if (this.#focusedId === undefined || ids.includes(this.#focusedId)) return;

    const previousIndex = this.#focusedIndex;
    this.#focusedId = undefined;
    if (!this.#focusStranded()) return;
    if (ids.length === 0) return;
    const nextIndex = Math.max(0, Math.min(previousIndex, ids.length - 1));
    const nextId = ids[nextIndex];
    if (nextId !== undefined) this.#focusItem(nextId);
  }

  /**
   * Whether focus was stranded by the render — on the body, nulled, on a
   * now-detached node, or still inside one of our widgets — as opposed to having
   * deliberately moved to another live control (which we must not steal).
   */
  #focusStranded(): boolean {
    const active = this.#announcer.element.ownerDocument.activeElement;
    if (active === null) return true;
    if (active === active.ownerDocument.body) return true;
    if (!active.isConnected) return true;
    return active.closest('[data-gm-instance]') !== null;
  }

  /** Focus a widget's item element and record it as the focused subject. */
  #focusItem(id: string): void {
    this.#canvas.itemElement(id)?.focus();
    this.#focusedId = id;
    this.#focusedIndex = this.#canvas.mountedInstanceIds.indexOf(id);
  }

  /** The accessible name for `id`: the configured resolver, else the item's label, else "Widget". */
  #nameFor(id: string): string {
    if (this.#labelFor !== undefined) return this.#labelFor(id);
    return this.#canvas.itemElement(id)?.getAttribute('aria-label') ?? 'Widget';
  }

  /** The grid extents used to clamp moves and resizes. */
  #bounds(): GridBounds {
    return { columns: this.#columns, minW: this.#minSize[0], minH: this.#minSize[1] };
  }
}

/** Whether a key activates (toggles move-mode / drops): Enter or Space (`' '` or legacy `'Spacebar'`). */
function isActivate(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}
