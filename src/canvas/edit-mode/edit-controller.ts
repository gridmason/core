/**
 * The edit-mode controller (docs/SPEC.md §2 `edit-mode`, FR-9): the canvas-layer
 * orchestrator that turns pointer and toolbar edits — drag, resize, add, remove,
 * and tab authoring — into governed, persisted layout changes on a
 * {@link EditableCanvas} (a {@link PageCanvas}).
 *
 * It composes the headless engine rather than re-implementing it:
 *
 * - **Drag/resize** arrive as a {@link CANVAS_GEOMETRY_CHANGE_EVENT} from the
 *   canvas (fired only for user edits); the controller folds the reported
 *   geometry back into the layout ({@link applyGeometry}), skipping locked slots.
 * - **Add** places a new instance by first-fit ({@link placeFirstFit}, engine
 *   placement) into the active grid; the eligible widget list for the picker
 *   comes from the C-E2 gating checks ({@link computeEligibleWidgets}).
 * - **Remove** tears an instance out — refused on a locked slot (SPEC §5).
 * - **Tabs** create/rename tabs when the page type allows them ({@link EditControllerOptions.allowTabs}).
 *
 * Every mutation routes through {@link EditController.#commit}: the **first**
 * genuine edit of an inherited layout forks a personal copy (copy-on-write,
 * {@link forkOnEdit}, FR-5), and the result is written back through the
 * persistence port under the layout's {@link ScopeKey}. Write debouncing and
 * virtualization are the sibling perf issue (#21); here each commit calls the
 * port directly.
 *
 * The controller never touches gridstack directly — it drives the canvas purely
 * by assigning `layout`/`editMode`/`activeTab` and listening for the canvas's
 * geometry-change event, so the engine's DOM-free/DOM-consumer split holds.
 */
import type { GridSize, LayoutPage, LayoutWidget, WidgetID } from '@gridmason/protocol';

import type { WidgetCatalogEntry } from '../../engine/catalog/index.js';
import type { EffectiveLayout, ScopeKey } from '../../engine/layout/index.js';
import { forkOnEdit } from '../../engine/layout/index.js';
import type { PickerPageType, WidgetGatePort, WidgetPermissionsPort } from '../../engine/picker/index.js';
import { eligibleWidgets as computeEligibleWidgets } from '../../engine/picker/index.js';
import { DEFAULT_GRID_COLUMNS, placeFirstFit } from '../../engine/placement/index.js';
import { CANVAS_GEOMETRY_CHANGE_EVENT } from '../PageCanvas/index.js';
import type { CanvasGeometryChangeDetail } from '../PageCanvas/index.js';

import {
  activeGridItems,
  addTab as addTabOp,
  addWidget as addWidgetOp,
  applyGeometry,
  findActiveItem,
  isItemLocked,
  removeWidget as removeWidgetOp,
  renameTab as renameTabOp,
} from './operations.js';

/** The footprint a widget is placed at when neither the manifest nor the caller pins one (SPEC §4). */
export const DEFAULT_WIDGET_SIZE: GridSize = [4, 3];

/**
 * The persistence port the controller writes edits through: `put(scopeKey, doc)`
 * (SPEC §5). This is the minimal slice the edit loop needs — the full
 * persistence adapter (C-E4, issue #22) is a superset (it adds `get`/`delete`),
 * so a host's adapter satisfies this structurally. Core makes no network call;
 * `put` is an adapter hop, not a fetch (SPEC §1).
 */
export interface LayoutPersistencePort {
  /** Persist the layout document for a scope key. May be sync or async; the controller does not await it. */
  put(key: ScopeKey, layout: LayoutPage): void | Promise<void>;
}

/**
 * The canvas surface the controller drives — the slice of {@link PageCanvas} it
 * uses. An `EventTarget` (for the geometry-change event) plus the three inputs it
 * sets. `PageCanvas` satisfies this structurally.
 */
export interface EditableCanvas extends EventTarget {
  /** Whether the canvas is in edit mode (gridstack drag/resize enabled). */
  editMode: boolean;
  /** Which tab's grid renders, for a tabbed layout. */
  activeTab: number;
  /** The resolved layout to render. */
  layout: EffectiveLayout | undefined;
}

/** The catalog + page + gating ports the controller uses to compute the add-widget picker list (SPEC §6). */
export interface EditControllerPicker {
  /** The registered widget types to gate (typically `catalog.list()`). */
  readonly catalog: Iterable<WidgetCatalogEntry>;
  /** The page the widgets are gated against (id + typed context). */
  readonly pageType: PickerPageType;
  /** Governance-gate port (check 3). */
  readonly gates: WidgetGatePort;
  /** Data-permission port (check 4). */
  readonly permissions: WidgetPermissionsPort;
}

/** A request to add a widget instance: its identity, optional footprint, saved props, and slot. */
export interface AddWidgetInput {
  /** Source-qualified identity of the widget type to place. */
  readonly widgetID: WidgetID;
  /** Footprint `[w,h]` to place it at; defaults to {@link DEFAULT_WIDGET_SIZE}. Clamped to the grid width. */
  readonly size?: GridSize;
  /** Initial saved props for the instance. */
  readonly props?: Readonly<Record<string, unknown>>;
  /** Slot the instance fills, for a slotted page-type layout. */
  readonly slot?: string;
}

/** Everything an {@link EditController} needs to drive one canvas's edit session. */
export interface EditControllerOptions {
  /** The canvas being edited. */
  readonly canvas: EditableCanvas;
  /** Where forked/edited layouts are written (SPEC §5). */
  readonly persistence: LayoutPersistencePort;
  /** The key the edited layout persists under. */
  readonly scopeKey: ScopeKey;
  /**
   * The resolved layout the user starts from (the baseline for copy-on-write):
   * its `layout` seeds the working document and its `lockedSlots` are the slots
   * edit mode must not offer to move/resize/remove.
   */
  readonly inherited: EffectiveLayout;
  /**
   * Whether end users may edit this page at all (the page type's
   * `allow_user_customization`, SPEC §3). Defaults to `true`. When `false`,
   * {@link EditController.enter} is inert and every mutation throws.
   */
  readonly allowCustomization?: boolean;
  /**
   * Whether the page type permits tab authoring (the `allowTabs` page-type lock
   * option, SPEC §3). Defaults to `false`; tab mutations throw when disallowed.
   */
  readonly allowTabs?: boolean;
  /** Grid column count for first-fit placement. Defaults to {@link DEFAULT_GRID_COLUMNS}. */
  readonly columns?: number;
  /** The picker inputs; required only to call {@link EditController.eligibleWidgets}. */
  readonly picker?: EditControllerPicker;
  /** Injectable id generator for new instances (deterministic in tests). Defaults to `crypto.randomUUID`. */
  readonly newInstanceId?: () => string;
}

/**
 * Drives an edit session over one {@link EditableCanvas}: enter/exit edit mode,
 * apply drag/resize, add/remove widgets, author tabs — each edit forking a
 * personal copy on first genuine change and persisting through the port. Respects
 * governance: locked slots are never offered a move/resize/remove.
 */
export class EditController {
  readonly #canvas: EditableCanvas;
  readonly #persistence: LayoutPersistencePort;
  readonly #scopeKey: ScopeKey;
  readonly #inheritedBaseline: LayoutPage;
  readonly #lockedSlots: ReadonlySet<string>;
  readonly #allowCustomization: boolean;
  readonly #allowTabs: boolean;
  readonly #columns: number;
  readonly #picker: EditControllerPicker | undefined;
  readonly #newInstanceId: () => string;

  #working: LayoutPage;
  #forked = false;
  #editing = false;
  #activeTab = 0;

  constructor(options: EditControllerOptions) {
    this.#canvas = options.canvas;
    this.#persistence = options.persistence;
    this.#scopeKey = options.scopeKey;
    this.#inheritedBaseline = options.inherited.layout;
    this.#working = options.inherited.layout;
    this.#lockedSlots = new Set(options.inherited.lockedSlots);
    this.#allowCustomization = options.allowCustomization ?? true;
    this.#allowTabs = options.allowTabs ?? false;
    this.#columns = options.columns ?? DEFAULT_GRID_COLUMNS;
    this.#picker = options.picker;
    this.#newInstanceId = options.newInstanceId ?? (() => crypto.randomUUID());

    this.#syncCanvas();
    this.#canvas.addEventListener(CANVAS_GEOMETRY_CHANGE_EVENT, this.#onGeometryChange);
  }

  /** The current working layout document (the personal copy once forked, else the inherited baseline). */
  get layout(): LayoutPage {
    return this.#working;
  }

  /** Whether the inherited layout has been forked into a personal copy (SPEC §5). */
  get forked(): boolean {
    return this.#forked;
  }

  /** Whether the canvas is currently in edit mode. */
  get editing(): boolean {
    return this.#editing;
  }

  /** The active tab index (0 for an untabbed page). */
  get activeTab(): number {
    return this.#activeTab;
  }

  /** The slots governance has locked on this page (fixed; not editable). */
  get lockedSlots(): ReadonlySet<string> {
    return this.#lockedSlots;
  }

  /** Enter edit mode: enable gridstack drag/resize. Inert if the page forbids customization (SPEC §3). */
  enter(): void {
    if (!this.#allowCustomization) return;
    this.#editing = true;
    this.#canvas.editMode = true;
  }

  /** Exit edit mode: return the canvas to static rendering. */
  exit(): void {
    this.#editing = false;
    this.#canvas.editMode = false;
  }

  /** Detach the canvas listener. Call when the controller is discarded so it stops reacting to edits. */
  dispose(): void {
    this.#canvas.removeEventListener(CANVAS_GEOMETRY_CHANGE_EVENT, this.#onGeometryChange);
  }

  /** Switch the active tab (a view change — not a layout edit, so nothing is forked or persisted). */
  switchTab(index: number): void {
    this.#activeTab = index;
    this.#canvas.activeTab = index;
  }

  /**
   * Add a widget instance to the active grid, placed by first-fit (SPEC §2).
   * Returns the created {@link LayoutWidget} (its generated `i` lets the caller
   * address the new instance). Throws if the page forbids customization.
   */
  addWidget(input: AddWidgetInput): LayoutWidget {
    this.#assertEditable();
    const [w, h] = input.size ?? DEFAULT_WIDGET_SIZE;
    const rect = placeFirstFit(activeGridItems(this.#working, this.#activeTab), { w, h }, this.#columns);
    const item: LayoutWidget = {
      widgetID: input.widgetID,
      i: this.#newInstanceId(),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      ...(input.props !== undefined ? { props: input.props } : {}),
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
    };
    this.#commit(addWidgetOp(this.#working, this.#activeTab, item));
    return item;
  }

  /**
   * Remove the widget with `instanceId` from the active grid. Returns `false`
   * without persisting when the instance is absent or sits in a **locked** slot
   * (governance forbids removal, SPEC §5); `true` when it was removed.
   */
  removeWidget(instanceId: string): boolean {
    this.#assertEditable();
    const item = findActiveItem(this.#working, this.#activeTab, instanceId);
    if (item === undefined || isItemLocked(item, this.#lockedSlots)) return false;
    this.#commit(removeWidgetOp(this.#working, this.#activeTab, instanceId));
    return true;
  }

  /**
   * Whether the UI should offer a remove affordance for `instanceId`: the
   * instance exists on the active grid, the page allows customization, and the
   * slot is not locked (SPEC §5 — a locked slot offers no remove).
   */
  canRemove(instanceId: string): boolean {
    if (!this.#allowCustomization) return false;
    const item = findActiveItem(this.#working, this.#activeTab, instanceId);
    return item !== undefined && !isItemLocked(item, this.#lockedSlots);
  }

  /** Whether `instanceId` sits in a locked slot (so it cannot be moved, resized, or removed). */
  isLocked(instanceId: string): boolean {
    const item = findActiveItem(this.#working, this.#activeTab, instanceId);
    return item !== undefined && isItemLocked(item, this.#lockedSlots);
  }

  /** Append a new empty tab (SPEC §5). Throws if customization or tabs are disallowed. */
  addTab(name: string): void {
    this.#assertEditable();
    this.#assertTabsAllowed();
    this.#commit(addTabOp(this.#working, name));
  }

  /** Rename the tab at `index`. Throws if customization or tabs are disallowed; a no-op if the index is out of range. */
  renameTab(index: number, name: string): void {
    this.#assertEditable();
    this.#assertTabsAllowed();
    this.#commit(renameTabOp(this.#working, index, name));
  }

  /**
   * The widgets eligible for the add-widget picker on this page — the C-E2 gating
   * checks (SPEC §6): a widget failing any check is absent, not greyed. Requires
   * the `picker` option; throws if it was not supplied.
   */
  eligibleWidgets(): WidgetCatalogEntry[] {
    if (this.#picker === undefined) {
      throw new Error('no picker configured; supply `picker` in the options to list eligible widgets');
    }
    return computeEligibleWidgets(this.#picker.catalog, this.#picker.pageType, {
      gates: this.#picker.gates,
      permissions: this.#picker.permissions,
    });
  }

  /** React to a settled user drag/resize by folding the reported geometry into the layout. */
  readonly #onGeometryChange = (event: Event): void => {
    if (!this.#editing) return;
    const detail = (event as CustomEvent<CanvasGeometryChangeDetail>).detail;
    if (!detail) return;
    this.#commit(applyGeometry(this.#working, this.#activeTab, detail.geometry, this.#lockedSlots));
  };

  /**
   * Commit a candidate layout: on the first genuine change fork a personal copy
   * (copy-on-write), otherwise write to the existing fork. A structural no-op
   * (the edit changed nothing) keeps the user inheriting and persists nothing.
   * On a real change, re-render the canvas and persist through the port.
   */
  #commit(next: LayoutPage): void {
    if (this.#forked) {
      this.#working = next;
    } else {
      const result = forkOnEdit(this.#inheritedBaseline, next);
      if (!result.forked) return;
      this.#forked = true;
      this.#working = result.layout;
    }
    this.#syncCanvas();
    void this.#persistence.put(this.#scopeKey, this.#working);
  }

  /** Render the working layout onto the canvas, carrying the locked-slot metadata. */
  #syncCanvas(): void {
    this.#canvas.layout = { layout: this.#working, lockedSlots: [...this.#lockedSlots] };
  }

  /** Guard a mutation on a page that forbids user customization (SPEC §3 fully-locked page). */
  #assertEditable(): void {
    if (!this.#allowCustomization) {
      throw new Error('editing is not allowed on this page (allow_user_customization is false)');
    }
  }

  /** Guard a tab mutation on a page type that does not permit tabs (SPEC §3 `allowTabs`). */
  #assertTabsAllowed(): void {
    if (!this.#allowTabs) {
      throw new Error('tab authoring is not allowed on this page type (allowTabs is false)');
    }
  }
}
