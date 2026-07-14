/**
 * Pure edit operations over a {@link LayoutPage} (docs/SPEC.md §2, §5, FR-9).
 *
 * Each function is a **pure transform** — layout in, a new layout out, no
 * mutation — so the {@link EditController} can compute the document an edit
 * produces without touching the DOM, and the fork/persist decision (copy-on-
 * write, FR-5) runs against a plain value. The controller layers the DOM
 * concerns (gridstack, mounting, persistence) on top; these operations know only
 * the layout shape.
 *
 * Every operation targets the **active grid**: the single grid of an untabbed
 * page, or the grid of the tab at `tabIndex` for a tabbed page. Governance is
 * respected by the caller (locked slots are skipped in {@link applyGeometry} and
 * guarded by the controller for removal), keeping these transforms mechanical.
 */
import type { LayoutPage, LayoutTab, LayoutWidget } from '@gridmason/protocol';

import type { WidgetGeometry } from '../PageCanvas/index.js';

/**
 * The items on the active grid: the single grid's items for an untabbed page, or
 * the `tabIndex` tab's items for a tabbed page. An out-of-range tab index yields
 * an empty list.
 */
export function activeGridItems(layout: LayoutPage, tabIndex: number): readonly LayoutWidget[] {
  if (layout.hasTabs) {
    return layout.tabs[tabIndex]?.grid.items ?? [];
  }
  return layout.grid.items;
}

/**
 * A new layout with the active grid's items replaced by `items`. For a tabbed
 * page only the `tabIndex` tab is rewritten; every other tab is shared
 * unchanged. An out-of-range tab index is a no-op (the layout is returned as-is).
 */
export function withActiveGridItems(
  layout: LayoutPage,
  tabIndex: number,
  items: readonly LayoutWidget[],
): LayoutPage {
  if (layout.hasTabs) {
    if (tabIndex < 0 || tabIndex >= layout.tabs.length) return layout;
    return {
      ...layout,
      tabs: layout.tabs.map((tab, index) => (index === tabIndex ? { name: tab.name, grid: { items } } : tab)),
    };
  }
  return { ...layout, grid: { items } };
}

/** The item with `instanceId` on the active grid, or `undefined` if none is placed there. */
export function findActiveItem(
  layout: LayoutPage,
  tabIndex: number,
  instanceId: string,
): LayoutWidget | undefined {
  return activeGridItems(layout, tabIndex).find((item) => item.i === instanceId);
}

/** Whether an item sits in a locked slot and so cannot be moved, resized, or removed (SPEC §5). */
export function isItemLocked(item: LayoutWidget, lockedSlots: ReadonlySet<string>): boolean {
  return item.slot !== undefined && lockedSlots.has(item.slot);
}

/**
 * Apply a drag/resize result to the active grid: for each item, adopt the
 * matching `{x,y,w,h}` from `geometry` (keyed by `i`). A **locked** item keeps
 * its saved geometry regardless of what gridstack reports, so governance holds
 * even if a stray event names a locked slot. Items with no matching geometry
 * entry are unchanged.
 */
export function applyGeometry(
  layout: LayoutPage,
  tabIndex: number,
  geometry: readonly WidgetGeometry[],
  lockedSlots: ReadonlySet<string>,
): LayoutPage {
  const byId = new Map(geometry.map((g) => [g.i, g]));
  const next = activeGridItems(layout, tabIndex).map((item) => {
    const g = byId.get(item.i);
    if (g === undefined || isItemLocked(item, lockedSlots)) return item;
    return { ...item, x: g.x, y: g.y, w: g.w, h: g.h };
  });
  return withActiveGridItems(layout, tabIndex, next);
}

/** Append a new placed widget to the active grid. */
export function addWidget(layout: LayoutPage, tabIndex: number, item: LayoutWidget): LayoutPage {
  return withActiveGridItems(layout, tabIndex, [...activeGridItems(layout, tabIndex), item]);
}

/**
 * Remove the widget with `instanceId` from the active grid. A no-op (returns an
 * equal item set) if no such item is placed there. Locked-slot enforcement is
 * the controller's job — this transform is mechanical.
 */
export function removeWidget(layout: LayoutPage, tabIndex: number, instanceId: string): LayoutPage {
  const items = activeGridItems(layout, tabIndex);
  return withActiveGridItems(
    layout,
    tabIndex,
    items.filter((item) => item.i !== instanceId),
  );
}

/**
 * Append a new, empty tab named `name` (SPEC §5 tabs). If the page is already
 * tabbed the tab is appended. If it is a single-grid page it is **converted**:
 * its existing grid becomes the first tab (named after the page), and the new
 * tab follows — so no placed widget is ever lost by adding the first tab.
 */
export function addTab(layout: LayoutPage, name: string): LayoutPage {
  const newTab: LayoutTab = { name, grid: { items: [] } };
  if (layout.hasTabs) {
    return { ...layout, tabs: [...layout.tabs, newTab] };
  }
  return {
    ...layout,
    hasTabs: true,
    grid: { items: [] },
    tabs: [{ name: layout.name, grid: layout.grid }, newTab],
  };
}

/**
 * Rename the tab at `index` to `name`, preserving its grid. A no-op if the page
 * is not tabbed or `index` is out of range.
 */
export function renameTab(layout: LayoutPage, index: number, name: string): LayoutPage {
  if (!layout.hasTabs || index < 0 || index >= layout.tabs.length) return layout;
  return {
    ...layout,
    tabs: layout.tabs.map((tab, i) => (i === index ? { name, grid: tab.grid } : tab)),
  };
}
