/**
 * `PageCanvas` — the `<gm-page-canvas>` custom element (docs/SPEC.md §2, §4,
 * FR-8, FR-11). The gridstack.js binding and the **only DOM consumer** in
 * `@gridmason/core`: the engine resolves a layout to an {@link EffectiveLayout}
 * (DOM-free); this element renders it to a real grid, mounting one widget custom
 * element per {@link LayoutWidget} with the widget ABI (see `./abi.ts`).
 *
 * Data flows in as **properties** (not attributes), because the inputs are
 * structured values a string attribute cannot carry: {@link PageCanvas.layout}
 * (the resolved layout), {@link PageCanvas.context} (the typed page-context
 * value), {@link PageCanvas.sdk} (the opaque host SDK handle), plus the
 * {@link PageCanvas.editMode} and {@link PageCanvas.activeTab} flags. Setting any
 * of them re-renders synchronously, so a host or a test observes the effect
 * immediately after assignment.
 *
 * Geometry uses the POC's `{x,y,w,h,i}` grid coordinates unchanged (SPEC §2):
 * each item is placed by its `{x,y,w,h}` under its stable key `i`, which round-
 * trips through gridstack.
 *
 * ## Lifecycle guarantee (SPEC §4, FR-11)
 *
 * Every element mount/unmount goes through a {@link WidgetMountManager}, which
 * removes a widget from the DOM (firing its `disconnectedCallback`) **before**
 * its slot is reused. On a re-render the canvas unmounts departing and
 * identity-changed widgets *first*, then mounts arrivals — so every
 * `disconnectedCallback` is delivered before any new `connectedCallback`, across
 * a layout change, a tab switch, or a resolution-gate flip. See the mount
 * manager for the widget cleanup contract.
 *
 * ## Scope
 *
 * This element is the mounting + lifecycle foundation. Edit-mode drag/resize/add/
 * remove/tab authoring (#18), the keyboard alternative and richer a11y (#19), the
 * per-widget error boundary and skeletons (#20), and virtualization + debounced
 * writes (#21) build on it. `editMode` here reflects the `edit-mode` ABI
 * attribute to widgets and toggles gridstack out of static mode; it does not yet
 * persist user edits (that is #18). `activeTab` selects which tab's grid renders
 * so a tab switch exercises the real mount/unmount path; tab *authoring* is #18.
 */
import { GridStack } from 'gridstack';
import type { GridItemHTMLElement } from 'gridstack';

import type { EffectiveLayout } from '../../engine/layout/index.js';
import type { LayoutWidget } from '@gridmason/protocol';

import type { WidgetAbiState, WidgetMountInput } from './abi.js';
import { assignSdkHandle } from './abi.js';
import { WidgetMountManager } from './mount-manager.js';

/** The grid item geometry the canvas renders and reads back — the POC `{x,y,w,h,i}`. */
export interface WidgetGeometry {
  /** Column of the top-left cell. */
  readonly x: number;
  /** Row of the top-left cell. */
  readonly y: number;
  /** Width in grid columns. */
  readonly w: number;
  /** Height in grid rows. */
  readonly h: number;
  /** The instance's stable grid-item key. */
  readonly i: string;
}

/** Default gridstack column count when a layout does not pin one (SPEC §3 `maxColumns`). */
const DEFAULT_COLUMNS = 12;

/**
 * The custom-element base, resolved at module load. In a DOM it is the real
 * `HTMLElement`; in a DOM-free environment it degrades to a stand-in so the
 * aggregate `@gridmason/core` barrel (which re-exports this DOM layer alongside
 * the headless engine) still *imports* under Node — a headless consumer that
 * only touches the engine never evaluates a `PageCanvas`. `PageCanvas` is only
 * ever registered or instantiated where a DOM exists ({@link PageCanvas.define}
 * guards on `customElements`), so the stand-in is never actually used.
 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class PageCanvas extends HTMLElementBase {
  /** The custom-element tag this class registers as (SPEC §2). */
  static readonly tagName = 'gm-page-canvas';

  /**
   * Register `<gm-page-canvas>` in a custom-element registry (the global one by
   * default). Idempotent: a second call is a no-op, so a host may call it freely
   * without risking the define-time collision `customElements.define` throws.
   */
  static define(registry: CustomElementRegistry = customElements): void {
    if (registry.get(PageCanvas.tagName) === undefined) {
      registry.define(PageCanvas.tagName, PageCanvas);
    }
  }

  readonly #mounts = new WidgetMountManager();
  /** Grid-item element per instance id — the join between a layout item and its gridstack node. */
  readonly #items = new Map<string, GridItemHTMLElement>();

  #grid: GridStack | undefined;
  #gridHost: HTMLElement | undefined;

  #layout: EffectiveLayout | undefined;
  #context: unknown;
  #sdk: unknown;
  #editMode = false;
  #activeTabIndex = 0;

  /** The resolved layout to render. Setting it re-renders the canvas synchronously. */
  get layout(): EffectiveLayout | undefined {
    return this.#layout;
  }
  set layout(value: EffectiveLayout | undefined) {
    this.#layout = value;
    // A new layout may drop the current tab index out of range; clamp on render.
    this.#render();
  }

  /**
   * The typed page-context **value** the page provides, serialized to every
   * widget's `context` attribute (SPEC §3). Setting it updates mounted widgets in
   * place — no re-mount.
   */
  get context(): unknown {
    return this.#context;
  }
  set context(value: unknown) {
    this.#context = value;
    this.#refreshAbiState();
  }

  /**
   * The opaque host SDK handle passed through to every widget's `sdk` property at
   * mount (SPEC §4). The canvas never inspects it. Setting it re-assigns the
   * handle on already-mounted widgets and applies to future mounts.
   */
  get sdk(): unknown {
    return this.#sdk;
  }
  set sdk(value: unknown) {
    this.#sdk = value;
    for (const instanceId of this.#mounts.instanceIds) {
      const mounted = this.#mounts.get(instanceId);
      if (mounted !== undefined) assignSdkHandle(mounted.element, value);
    }
  }

  /**
   * Whether the canvas is in edit mode. Reflected as the `edit-mode` boolean ABI
   * attribute on every widget and toggles gridstack out of static mode. Does not
   * yet persist edits (#18). Setting it updates mounted widgets in place.
   */
  get editMode(): boolean {
    return this.#editMode;
  }
  set editMode(value: boolean) {
    this.#editMode = value;
    this.#grid?.setStatic(!value);
    this.#refreshAbiState();
  }

  /**
   * The index of the tab whose grid is rendered, for a tabbed layout (SPEC §5).
   * Ignored for a single-grid layout. Setting it re-renders — unmounting the
   * current tab's widgets before mounting the new tab's, exercising the lifecycle
   * guarantee on a tab switch. Out-of-range values render an empty grid.
   */
  get activeTab(): number {
    return this.#activeTabIndex;
  }
  set activeTab(index: number) {
    this.#activeTabIndex = index;
    this.#render();
  }

  /** The instance ids currently mounted on the active grid, in mount order. */
  get mountedInstanceIds(): readonly string[] {
    return this.#mounts.instanceIds;
  }

  /** The mounted widget element for `instanceId`, or `undefined` if not mounted. */
  widgetElement(instanceId: string): HTMLElement | undefined {
    return this.#mounts.get(instanceId)?.element;
  }

  /**
   * The live `{x,y,w,h,i}` geometry of a mounted instance, read back from
   * gridstack — the round-trip of the layout's placement (SPEC §2). `undefined`
   * if `instanceId` is not mounted.
   */
  geometryOf(instanceId: string): WidgetGeometry | undefined {
    const itemEl = this.#items.get(instanceId);
    const node = itemEl?.gridstackNode;
    if (node === undefined) return undefined;
    return { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1, i: instanceId };
  }

  /** Initialize the grid and render on connection (SPEC §2 — DOM work happens here). */
  connectedCallback(): void {
    this.#ensureGrid();
    this.#render();
  }

  /**
   * Tear down on disconnection: unmount every widget (each firing its
   * `disconnectedCallback` — the lifecycle guarantee) and destroy the grid,
   * leaving the element reusable if it is re-connected later.
   */
  disconnectedCallback(): void {
    this.#teardown();
  }

  /** Create the `.grid-stack` host and initialize gridstack, once, on connect. */
  #ensureGrid(): void {
    if (this.#grid !== undefined) return;
    // Landmark the canvas so the a11y sibling (#19) can build AA announcements on
    // a stable region root.
    this.setAttribute('role', 'region');
    const host = this.ownerDocument.createElement('div');
    host.classList.add('grid-stack');
    this.appendChild(host);
    this.#gridHost = host;
    this.#grid = GridStack.init(
      {
        column: DEFAULT_COLUMNS,
        staticGrid: !this.#editMode,
        acceptWidgets: false,
        // Render a resolved layout at its saved coordinates: float keeps each
        // item at its `{x,y}` instead of vertically compacting gaps away, so the
        // designed placement round-trips (SPEC §2). Compaction on user edits is a
        // later, opt-in edit-mode concern (#18).
        float: true,
      },
      host,
    );
  }

  /** Destroy the grid and unmount all widgets; safe to call more than once. */
  #teardown(): void {
    this.#mounts.unmountAll();
    this.#items.clear();
    // destroy(false): drop gridstack's engine + listeners but leave our host div,
    // so a re-connect can re-init cleanly.
    this.#grid?.destroy(false);
    this.#grid = undefined;
    if (this.#gridHost !== undefined) {
      this.#gridHost.remove();
      this.#gridHost = undefined;
    }
  }

  /** The items of the grid currently selected for rendering (single grid, or the active tab). */
  #activeItems(): readonly LayoutWidget[] {
    const layout = this.#layout?.layout;
    if (layout === undefined) return [];
    if (layout.hasTabs) {
      return layout.tabs[this.#activeTabIndex]?.grid.items ?? [];
    }
    return layout.grid.items;
  }

  /** The set of slots locked by governance (SPEC §5) — rendered non-interactive. */
  #lockedSlots(): ReadonlySet<string> {
    return new Set(this.#layout?.lockedSlots ?? []);
  }

  /**
   * Reconcile the grid with the active layout. Departing and identity-changed
   * widgets are unmounted **first** (all `disconnectedCallback`s fire before any
   * new mount — the SPEC §4 guarantee), then arrivals are mounted and survivors
   * updated in place. A no-op until the grid is initialized (on connect).
   */
  #render(): void {
    if (this.#grid === undefined) return;
    const items = this.#activeItems();
    const locked = this.#lockedSlots();
    const desired = new Map(items.map((item) => [item.i, item]));

    // Phase 1 — remove. A widget leaves if it is gone from the layout, or if its
    // identity (tag) changed and so needs a fresh element. Doing every removal
    // before any mount is what makes disconnect precede re-mount on a swap.
    for (const [instanceId] of [...this.#items]) {
      const want = desired.get(instanceId);
      const mounted = this.#mounts.get(instanceId);
      if (want === undefined || (mounted !== undefined && mounted.tag !== want.widgetID.tag)) {
        this.#removeItem(instanceId);
      }
    }

    // Phase 2 — add new items and update survivors in place (geometry + ABI).
    for (const item of items) {
      if (this.#items.has(item.i)) {
        this.#updateItem(item, locked);
      } else {
        this.#addItem(item, locked);
      }
    }
  }

  /** Place a new grid item and mount its widget element into the item's content host. */
  #addItem(item: LayoutWidget, locked: ReadonlySet<string>): void {
    const isLocked = item.slot !== undefined && locked.has(item.slot);
    const itemEl = this.#grid!.addWidget({
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      id: item.i,
      locked: isLocked,
      noMove: isLocked,
      noResize: isLocked,
    });
    // Landmark each widget for a11y (#19 elaborates announcements/labels).
    itemEl.setAttribute('role', 'group');
    itemEl.setAttribute('aria-roledescription', 'widget');
    const host = (itemEl.querySelector('.grid-stack-item-content') as HTMLElement | null) ?? itemEl;
    this.#items.set(item.i, itemEl);
    this.#mounts.mount(host, this.#mountInput(item));
  }

  /** Update a surviving item's geometry (gridstack) and ABI state (in place, no re-mount). */
  #updateItem(item: LayoutWidget, locked: ReadonlySet<string>): void {
    const itemEl = this.#items.get(item.i)!;
    const isLocked = item.slot !== undefined && locked.has(item.slot);
    this.#grid!.update(itemEl, {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      locked: isLocked,
      noMove: isLocked,
      noResize: isLocked,
    });
    this.#mounts.updateAbiState(item.i, this.#abiState(item));
  }

  /** Unmount a widget (fires `disconnectedCallback`) then remove its now-empty grid item. */
  #removeItem(instanceId: string): void {
    // Unmount first so the widget's disconnectedCallback fires deterministically,
    // before gridstack tears the item element out of the DOM.
    this.#mounts.unmount(instanceId);
    const itemEl = this.#items.get(instanceId);
    if (itemEl !== undefined) {
      this.#grid!.removeWidget(itemEl, true, false);
      this.#items.delete(instanceId);
    }
  }

  /** Re-apply the mutable ABI (context / settings / edit-mode) to every mounted widget. */
  #refreshAbiState(): void {
    for (const item of this.#activeItems()) {
      this.#mounts.updateAbiState(item.i, this.#abiState(item));
    }
  }

  /** The mutable ABI state for one layout item, under the canvas-wide context/edit-mode. */
  #abiState(item: LayoutWidget): WidgetAbiState {
    return { context: this.#context, settings: item.props, editMode: this.#editMode };
  }

  /** The full mount input for one layout item (identity + SDK handle + ABI state). */
  #mountInput(item: LayoutWidget): WidgetMountInput {
    return {
      tag: item.widgetID.tag,
      instanceId: item.i,
      sdk: this.#sdk,
      ...this.#abiState(item),
    };
  }
}
