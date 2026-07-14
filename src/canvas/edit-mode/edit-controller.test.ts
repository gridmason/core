import { beforeEach, expect, test } from 'vitest';

import type { LayoutPage, LayoutWidget, Manifest } from '@gridmason/protocol';

import type { WidgetCatalogEntry } from '../../engine/catalog/index.js';
import type { EffectiveLayout, ScopeKey } from '../../engine/layout/index.js';
import { scopeKeyString } from '../../engine/layout/index.js';
import { CANVAS_GEOMETRY_CHANGE_EVENT } from '../PageCanvas/index.js';
import type { CanvasGeometryChangeDetail, WidgetGeometry } from '../PageCanvas/index.js';

import { EditController } from './edit-controller.js';

// A minimal stand-in for the PageCanvas surface the controller drives: an
// EventTarget (for the geometry-change event) plus the three settable inputs.
class FakeCanvas extends EventTarget {
  editMode = false;
  activeTab = 0;
  layout: EffectiveLayout | undefined;
}

/** An in-memory persistence double whose stored doc a test can read back. */
function memoryPersistence() {
  const store = new Map<string, LayoutPage>();
  return {
    port: {
      put(key: ScopeKey, layout: LayoutPage): void {
        store.set(scopeKeyString(key), layout);
      },
    },
    stored(key: ScopeKey): LayoutPage | undefined {
      return store.get(scopeKeyString(key));
    },
    size(): number {
      return store.size;
    },
  };
}

const SCOPE: ScopeKey = { owner: 'user', pageType: 'demo' };

const widget = (i: string, over: Partial<LayoutWidget> = {}): LayoutWidget => ({
  widgetID: { source: 'local', tag: 'gm-demo' },
  i,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
  ...over,
});

const single = (items: LayoutWidget[], lockedSlots: string[] = []): EffectiveLayout => ({
  layout: {
    schemaVersion: 1,
    page: 'demo',
    name: 'Demo',
    default: true,
    grid: { items },
    hasTabs: false,
    tabs: [],
  },
  lockedSlots,
});

const tabbed = (tabs: { name: string; items: LayoutWidget[] }[]): EffectiveLayout => ({
  layout: {
    schemaVersion: 1,
    page: 'demo',
    name: 'Demo',
    default: true,
    grid: { items: [] },
    hasTabs: true,
    tabs: tabs.map((t) => ({ name: t.name, grid: { items: t.items } })),
  },
  lockedSlots: [],
});

// A deterministic id generator so a test can assert the new instance's `i`.
function sequentialIds(): () => string {
  let n = 0;
  return () => `new${++n}`;
}

function dispatchGeometry(canvas: FakeCanvas, geometry: WidgetGeometry[]): void {
  canvas.dispatchEvent(
    new CustomEvent<CanvasGeometryChangeDetail>(CANVAS_GEOMETRY_CHANGE_EVENT, { detail: { geometry } }),
  );
}

let canvas: FakeCanvas;
let persistence: ReturnType<typeof memoryPersistence>;

beforeEach(() => {
  canvas = new FakeCanvas();
  persistence = memoryPersistence();
});

function controller(inherited: EffectiveLayout, options: Record<string, unknown> = {}): EditController {
  return new EditController({
    canvas,
    persistence: persistence.port,
    scopeKey: SCOPE,
    inherited,
    newInstanceId: sequentialIds(),
    ...options,
  });
}

// --- construction + edit-mode toggle --------------------------------------

test('renders the working layout onto the canvas at construction, without persisting', () => {
  controller(single([widget('a')]));
  expect(canvas.layout?.layout.grid.items.map((i) => i.i)).toEqual(['a']);
  expect(persistence.size()).toBe(0); // constructing is not an edit
});

test('enter/exit toggles the canvas edit mode', () => {
  const c = controller(single([widget('a')]));
  c.enter();
  expect(canvas.editMode).toBe(true);
  expect(c.editing).toBe(true);
  c.exit();
  expect(canvas.editMode).toBe(false);
  expect(c.editing).toBe(false);
});

// --- add ------------------------------------------------------------------

test('addWidget forks on the first edit, first-fits, and persists', () => {
  const c = controller(single([widget('a', { w: 4, h: 3 })]));
  c.enter();
  const added = c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' } });

  expect(added).toMatchObject({ i: 'new1', x: 4, y: 0, w: 4, h: 3 }); // first-fit beside 'a'
  expect(c.forked).toBe(true);
  const stored = persistence.stored(SCOPE);
  expect(stored?.grid.items.map((i) => i.i)).toEqual(['a', 'new1']);
  expect(canvas.layout?.layout.grid.items.map((i) => i.i)).toEqual(['a', 'new1']);
});

test('addWidget honors an explicit footprint, clamped to the grid width', () => {
  const c = controller(single([]), { columns: 8 });
  const added = c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' }, size: [99, 2], props: { a: 1 } });
  expect(added).toMatchObject({ x: 0, y: 0, w: 8, h: 2, props: { a: 1 } });
});

// --- remove + locked-slot governance --------------------------------------

test('removeWidget removes an unlocked instance and persists', () => {
  const c = controller(single([widget('a'), widget('b', { x: 4 })]));
  expect(c.removeWidget('a')).toBe(true);
  expect(persistence.stored(SCOPE)?.grid.items.map((i) => i.i)).toEqual(['b']);
});

test('removeWidget refuses a locked slot and an absent instance without persisting', () => {
  const c = controller(single([widget('a', { slot: 'header' })], ['header']));
  expect(c.removeWidget('a')).toBe(false); // locked
  expect(c.removeWidget('missing')).toBe(false); // absent
  expect(persistence.size()).toBe(0);
  expect(c.forked).toBe(false);
});

test('canRemove / isLocked reflect governance and customization', () => {
  const c = controller(single([widget('a', { slot: 'header' }), widget('b')], ['header']));
  expect(c.isLocked('a')).toBe(true);
  expect(c.isLocked('b')).toBe(false);
  expect(c.canRemove('a')).toBe(false); // locked slot offers no remove
  expect(c.canRemove('b')).toBe(true);
  expect(c.canRemove('missing')).toBe(false);
});

// --- drag/resize via the geometry-change event ----------------------------

test('a geometry-change event in edit mode applies the geometry and persists', () => {
  const c = controller(single([widget('a')]));
  c.enter();
  dispatchGeometry(canvas, [{ i: 'a', x: 3, y: 2, w: 6, h: 4 }]);
  expect(c.forked).toBe(true);
  expect(persistence.stored(SCOPE)?.grid.items[0]).toMatchObject({ x: 3, y: 2, w: 6, h: 4 });
});

test('a geometry-change event is ignored when not in edit mode', () => {
  const c = controller(single([widget('a')]));
  dispatchGeometry(canvas, [{ i: 'a', x: 3, y: 2, w: 6, h: 4 }]);
  expect(c.forked).toBe(false);
  expect(persistence.size()).toBe(0);
});

test('a no-op geometry change does not fork or persist (keeps inheriting)', () => {
  const c = controller(single([widget('a', { x: 1, y: 1, w: 4, h: 3 })]));
  c.enter();
  dispatchGeometry(canvas, [{ i: 'a', x: 1, y: 1, w: 4, h: 3 }]); // identical
  expect(c.forked).toBe(false);
  expect(persistence.size()).toBe(0);
});

test('a geometry-change event without a detail payload is ignored', () => {
  const c = controller(single([widget('a')]));
  c.enter();
  canvas.dispatchEvent(new Event(CANVAS_GEOMETRY_CHANGE_EVENT)); // plain Event, no detail
  expect(c.forked).toBe(false);
});

test('a locked slot is not moved by a geometry-change event', () => {
  const c = controller(single([widget('a', { slot: 'header' })], ['header']));
  c.enter();
  dispatchGeometry(canvas, [{ i: 'a', x: 9, y: 9, w: 1, h: 1 }]);
  expect(c.forked).toBe(false); // nothing genuinely changed
  expect(persistence.size()).toBe(0);
});

// --- second edit after the fork -------------------------------------------

test('edits after the fork persist directly', () => {
  const c = controller(single([widget('a')]));
  c.enter();
  c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' } }); // forks
  c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' } }); // already forked
  expect(c.forked).toBe(true);
  expect(persistence.stored(SCOPE)?.grid.items.map((i) => i.i)).toEqual(['a', 'new1', 'new2']);
});

// --- tabs -----------------------------------------------------------------

test('tab authoring adds, renames, and switches on a tabbed page', () => {
  const c = controller(tabbed([{ name: 'One', items: [widget('a')] }]), { allowTabs: true });
  c.enter();
  c.addTab('Two');
  expect(persistence.stored(SCOPE)?.tabs.map((t) => t.name)).toEqual(['One', 'Two']);

  c.renameTab(0, 'Overview');
  expect(persistence.stored(SCOPE)?.tabs.map((t) => t.name)).toEqual(['Overview', 'Two']);

  c.switchTab(1);
  expect(c.activeTab).toBe(1);
  expect(canvas.activeTab).toBe(1);
  // Adding now targets the switched-to tab.
  c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' } });
  expect(persistence.stored(SCOPE)?.tabs[1]?.grid.items.map((i) => i.i)).toEqual(['new1']);
});

test('tab authoring throws when the page type disallows tabs', () => {
  const c = controller(tabbed([{ name: 'One', items: [] }]), { allowTabs: false });
  expect(() => c.addTab('Two')).toThrow(/tab authoring is not allowed/);
  expect(() => c.renameTab(0, 'X')).toThrow(/tab authoring is not allowed/);
});

// --- non-customizable page ------------------------------------------------

test('a non-customizable page cannot enter edit mode or mutate', () => {
  const c = controller(single([widget('a')]), { allowCustomization: false });
  c.enter();
  expect(canvas.editMode).toBe(false); // enter is inert
  expect(c.editing).toBe(false);
  expect(() => c.addWidget({ widgetID: { source: 'local', tag: 'gm-demo' } })).toThrow(/editing is not allowed/);
  expect(() => c.removeWidget('a')).toThrow(/editing is not allowed/);
  expect(c.canRemove('a')).toBe(false);
});

// --- dispose --------------------------------------------------------------

test('dispose stops the controller reacting to canvas events', () => {
  const c = controller(single([widget('a')]));
  c.enter();
  c.dispose();
  dispatchGeometry(canvas, [{ i: 'a', x: 5, y: 5, w: 2, h: 2 }]);
  expect(c.forked).toBe(false);
  expect(persistence.size()).toBe(0);
});

// --- picker gating --------------------------------------------------------

const entry = (tag: string, manifest: Partial<Manifest> = {}): WidgetCatalogEntry => ({
  id: { source: 'local', tag },
  manifest: { tag, kind: 'widget', ...manifest } as Manifest,
});

test('eligibleWidgets returns only gated-in widgets, and throws without a picker', () => {
  const withoutPicker = controller(single([widget('a')]));
  expect(() => withoutPicker.eligibleWidgets()).toThrow(/no picker configured/);

  const c = controller(single([widget('a')]), {
    picker: {
      catalog: [entry('gm-open'), entry('gm-gated')],
      pageType: { id: 'demo', context: {} },
      gates: { isGateOn: (q: { widget: { tag: string } }) => q.widget.tag !== 'gm-gated' },
      permissions: { hasPermissions: () => true },
    },
  });
  expect(c.eligibleWidgets().map((e) => e.id.tag)).toEqual(['gm-open']); // gated widget absent
});
