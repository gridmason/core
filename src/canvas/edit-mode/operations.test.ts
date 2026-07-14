import { expect, test } from 'vitest';

import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';

import type { WidgetGeometry } from '../PageCanvas/index.js';

import {
  activeGridItems,
  addTab,
  addWidget,
  applyGeometry,
  findActiveItem,
  isItemLocked,
  removeWidget,
  renameTab,
  withActiveGridItems,
} from './operations.js';

const widget = (i: string, over: Partial<LayoutWidget> = {}): LayoutWidget => ({
  widgetID: { source: 'local', tag: 'gm-demo' },
  i,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
  ...over,
});

const single = (items: LayoutWidget[]): LayoutPage => ({
  schemaVersion: 1,
  page: 'demo',
  name: 'Demo',
  default: true,
  grid: { items },
  hasTabs: false,
  tabs: [],
});

const tabbed = (tabs: { name: string; items: LayoutWidget[] }[]): LayoutPage => ({
  schemaVersion: 1,
  page: 'demo',
  name: 'Demo',
  default: true,
  grid: { items: [] },
  hasTabs: true,
  tabs: tabs.map((t) => ({ name: t.name, grid: { items: t.items } })),
});

const geo = (i: string, x: number, y: number, w: number, h: number): WidgetGeometry => ({ x, y, w, h, i });

// --- activeGridItems / withActiveGridItems --------------------------------

test('activeGridItems reads the single grid for an untabbed page', () => {
  const layout = single([widget('a'), widget('b')]);
  expect(activeGridItems(layout, 0).map((i) => i.i)).toEqual(['a', 'b']);
  // Tab index is ignored for a single-grid page.
  expect(activeGridItems(layout, 5).map((i) => i.i)).toEqual(['a', 'b']);
});

test('activeGridItems reads the addressed tab, empty for an out-of-range index', () => {
  const layout = tabbed([{ name: 'One', items: [widget('a')] }, { name: 'Two', items: [widget('b')] }]);
  expect(activeGridItems(layout, 1).map((i) => i.i)).toEqual(['b']);
  expect(activeGridItems(layout, 9)).toEqual([]);
});

test('withActiveGridItems replaces only the active tab and shares the rest', () => {
  const layout = tabbed([{ name: 'One', items: [widget('a')] }, { name: 'Two', items: [widget('b')] }]);
  const next = withActiveGridItems(layout, 0, [widget('z')]);
  expect(next.tabs[0]?.grid.items.map((i) => i.i)).toEqual(['z']);
  expect(next.tabs[1]).toBe(layout.tabs[1]); // untouched tab is shared by reference
});

test('withActiveGridItems is a no-op for an out-of-range tab index', () => {
  const layout = tabbed([{ name: 'One', items: [widget('a')] }]);
  expect(withActiveGridItems(layout, 3, [widget('z')])).toBe(layout);
});

// --- findActiveItem / isItemLocked ----------------------------------------

test('findActiveItem locates an item on the active grid', () => {
  const layout = single([widget('a'), widget('b')]);
  expect(findActiveItem(layout, 0, 'b')?.i).toBe('b');
  expect(findActiveItem(layout, 0, 'missing')).toBeUndefined();
});

test('isItemLocked is true only for an item whose slot is in the locked set', () => {
  const locked = new Set(['header']);
  expect(isItemLocked(widget('a', { slot: 'header' }), locked)).toBe(true);
  expect(isItemLocked(widget('a', { slot: 'body' }), locked)).toBe(false);
  expect(isItemLocked(widget('a'), locked)).toBe(false); // no slot
});

// --- applyGeometry --------------------------------------------------------

test('applyGeometry updates matched items and leaves unmatched ones', () => {
  const layout = single([widget('a'), widget('b', { x: 4 })]);
  const next = applyGeometry(layout, 0, [geo('a', 2, 3, 6, 4)], new Set());
  expect(next.grid.items[0]).toMatchObject({ i: 'a', x: 2, y: 3, w: 6, h: 4 });
  expect(next.grid.items[1]).toMatchObject({ i: 'b', x: 4 }); // no geometry entry: unchanged
});

test('applyGeometry never moves a locked slot even when geometry names it', () => {
  const layout = single([widget('a', { slot: 'header' })]);
  const next = applyGeometry(layout, 0, [geo('a', 9, 9, 1, 1)], new Set(['header']));
  expect(next.grid.items[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 }); // saved geometry held
});

// --- addWidget / removeWidget ---------------------------------------------

test('addWidget appends to the active grid', () => {
  const layout = single([widget('a')]);
  const next = addWidget(layout, 0, widget('b', { x: 4 }));
  expect(next.grid.items.map((i) => i.i)).toEqual(['a', 'b']);
});

test('removeWidget drops the named item, and is a no-op for an absent one', () => {
  const layout = single([widget('a'), widget('b')]);
  expect(removeWidget(layout, 0, 'a').grid.items.map((i) => i.i)).toEqual(['b']);
  expect(removeWidget(layout, 0, 'missing').grid.items.map((i) => i.i)).toEqual(['a', 'b']);
});

// --- addTab / renameTab ---------------------------------------------------

test('addTab appends an empty tab to a tabbed page', () => {
  const layout = tabbed([{ name: 'One', items: [widget('a')] }]);
  const next = addTab(layout, 'Two');
  expect(next.tabs.map((t) => t.name)).toEqual(['One', 'Two']);
  expect(next.tabs[1]?.grid.items).toEqual([]);
});

test('addTab converts a single-grid page, preserving its widgets as the first tab', () => {
  const layout = single([widget('a')]);
  const next = addTab(layout, 'Extra');
  expect(next.hasTabs).toBe(true);
  expect(next.grid.items).toEqual([]);
  expect(next.tabs.map((t) => t.name)).toEqual(['Demo', 'Extra']);
  expect(next.tabs[0]?.grid.items.map((i) => i.i)).toEqual(['a']); // no widget lost
});

test('renameTab renames the addressed tab, preserving its grid', () => {
  const layout = tabbed([{ name: 'One', items: [widget('a')] }, { name: 'Two', items: [] }]);
  const next = renameTab(layout, 0, 'Overview');
  expect(next.tabs.map((t) => t.name)).toEqual(['Overview', 'Two']);
  expect(next.tabs[0]?.grid.items.map((i) => i.i)).toEqual(['a']);
});

test('renameTab is a no-op off a single-grid page or out of range', () => {
  const singleLayout = single([widget('a')]);
  expect(renameTab(singleLayout, 0, 'X')).toBe(singleLayout);
  const tabbedLayout = tabbed([{ name: 'One', items: [] }]);
  expect(renameTab(tabbedLayout, 5, 'X')).toBe(tabbedLayout);
});
