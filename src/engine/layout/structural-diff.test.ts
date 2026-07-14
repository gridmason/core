import type { LayoutPage, LayoutTab, LayoutWidget } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { gridsEqual, layoutsEqual, structuralEqual } from './structural-diff.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Mirrors resolve.test.ts: minimal well-formed widgets and single-grid / tabbed
// LayoutDocs. Geometry (x, y, w, h) and props distinguish otherwise-identical
// items, so an assertion on equality proves what the diff treats as structural.

interface WidgetOpts {
  readonly slot?: string;
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly tag?: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

function widget(i: string, opts: WidgetOpts = {}): LayoutWidget {
  return {
    widgetID: { source: 'local', tag: opts.tag ?? 'gm-card' },
    i,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w: opts.w ?? 4,
    h: opts.h ?? 2,
    ...(opts.slot !== undefined ? { slot: opts.slot } : {}),
    ...(opts.props !== undefined ? { props: opts.props } : {}),
  };
}

function page(items: readonly LayoutWidget[], name = 'layout'): LayoutPage {
  return {
    schemaVersion: 1,
    page: 'crm.customer-detail',
    name,
    default: name === 'default',
    hasTabs: false,
    grid: { items },
    tabs: [],
  };
}

function tabbedPage(tabs: readonly LayoutTab[], name = 'layout'): LayoutPage {
  return {
    schemaVersion: 1,
    page: 'crm.customer-detail',
    name,
    default: name === 'default',
    hasTabs: true,
    grid: { items: [] },
    tabs,
  };
}

// ── structuralEqual: the key-order-insensitive deep comparator ────────────────

describe('structuralEqual', () => {
  test('identical primitives and references are equal', () => {
    expect(structuralEqual('x', 'x')).toBe(true);
    expect(structuralEqual(3, 3)).toBe(true);
    expect(structuralEqual(true, true)).toBe(true);
    expect(structuralEqual(null, null)).toBe(true);
    const shared = { a: 1 };
    expect(structuralEqual(shared, shared)).toBe(true);
  });

  test('different types are never equal', () => {
    expect(structuralEqual(1, '1')).toBe(false);
    expect(structuralEqual(0, false)).toBe(false);
  });

  test('a lone null is unequal to an object on either side', () => {
    expect(structuralEqual(null, {})).toBe(false);
    expect(structuralEqual({}, null)).toBe(false);
  });

  test('unequal primitives of the same type are unequal', () => {
    expect(structuralEqual(1, 2)).toBe(false);
    expect(structuralEqual('a', 'b')).toBe(false);
  });

  test('array vs object of the same typeof are unequal', () => {
    expect(structuralEqual([], {})).toBe(false);
    expect(structuralEqual({}, [])).toBe(false);
  });

  test('arrays compare position-sensitively', () => {
    expect(structuralEqual([1, 2], [1, 2])).toBe(true);
    expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structuralEqual([1, 2], [1, 3])).toBe(false);
    expect(structuralEqual([1, 2], [2, 1])).toBe(false);
  });

  test('object key order and whitespace do not matter', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(structuralEqual({ a: { p: 1, q: 2 } }, { a: { q: 2, p: 1 } })).toBe(true);
  });

  test('objects differing in key count, key name, or value are unequal', () => {
    expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(structuralEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(structuralEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  test('a key mapped to undefined is treated as absent', () => {
    expect(structuralEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(structuralEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    // An explicit value is still a difference from absence.
    expect(structuralEqual({ a: 1, b: 0 }, { a: 1 })).toBe(false);
  });
});

// ── gridsEqual: order-insensitive item-set comparison ─────────────────────────

describe('gridsEqual', () => {
  test('same items in a different order are equal', () => {
    const a = { items: [widget('one', { x: 0 }), widget('two', { x: 6 })] };
    const b = { items: [widget('two', { x: 6 }), widget('one', { x: 0 })] };
    expect(gridsEqual(a, b)).toBe(true);
  });

  test('a differing item count is unequal', () => {
    const a = { items: [widget('one')] };
    const b = { items: [widget('one'), widget('two')] };
    expect(gridsEqual(a, b)).toBe(false);
  });

  test('a differing item key is unequal', () => {
    const a = { items: [widget('one')] };
    const b = { items: [widget('two')] };
    expect(gridsEqual(a, b)).toBe(false);
  });

  test('a differing geometry or props on a matched item is unequal', () => {
    expect(gridsEqual({ items: [widget('one', { x: 0 })] }, { items: [widget('one', { x: 3 })] })).toBe(
      false,
    );
    expect(
      gridsEqual(
        { items: [widget('one', { props: { color: 'red' } })] },
        { items: [widget('one', { props: { color: 'blue' } })] },
      ),
    ).toBe(false);
  });
});

// ── layoutsEqual: the document-level fork-detection comparator ─────────────────

describe('layoutsEqual', () => {
  test('single-grid: equal ignoring metadata and item order', () => {
    const inherited = page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 6 })], 'default');
    // Same structure, different name/default, reordered items.
    const reserialized = page([widget('b', { slot: 'body', x: 6 }), widget('a', { slot: 'header', x: 0 })], 'user');
    expect(layoutsEqual(inherited, reserialized)).toBe(true);
  });

  test('single-grid: a geometry change is a genuine difference', () => {
    const a = page([widget('a', { slot: 'header', x: 0 })]);
    const b = page([widget('a', { slot: 'header', x: 9 })]);
    expect(layoutsEqual(a, b)).toBe(false);
  });

  test('a container-shape change (grid vs tabs) is unequal', () => {
    const grid = page([widget('a')]);
    const tabbed = tabbedPage([{ name: 'Overview', grid: { items: [widget('a')] } }]);
    expect(layoutsEqual(grid, tabbed)).toBe(false);
  });

  test('tabbed: equal when tab names and per-tab grids match', () => {
    const a = tabbedPage([
      { name: 'Overview', grid: { items: [widget('a', { x: 0 }), widget('b', { x: 6 })] } },
      { name: 'Activity', grid: { items: [widget('c')] } },
    ]);
    // Per-tab items reordered; tab order preserved.
    const b = tabbedPage([
      { name: 'Overview', grid: { items: [widget('b', { x: 6 }), widget('a', { x: 0 })] } },
      { name: 'Activity', grid: { items: [widget('c')] } },
    ]);
    expect(layoutsEqual(a, b)).toBe(true);
  });

  test('tabbed: differing tab count, tab name, or reordered tabs are unequal', () => {
    const base = tabbedPage([
      { name: 'Overview', grid: { items: [widget('a')] } },
      { name: 'Activity', grid: { items: [widget('c')] } },
    ]);
    const fewer = tabbedPage([{ name: 'Overview', grid: { items: [widget('a')] } }]);
    const renamed = tabbedPage([
      { name: 'Summary', grid: { items: [widget('a')] } },
      { name: 'Activity', grid: { items: [widget('c')] } },
    ]);
    const reordered = tabbedPage([
      { name: 'Activity', grid: { items: [widget('c')] } },
      { name: 'Overview', grid: { items: [widget('a')] } },
    ]);
    expect(layoutsEqual(base, fewer)).toBe(false);
    expect(layoutsEqual(base, renamed)).toBe(false);
    expect(layoutsEqual(base, reordered)).toBe(false);
  });

  test('tabbed: a per-tab grid change is unequal', () => {
    const a = tabbedPage([{ name: 'Overview', grid: { items: [widget('a', { x: 0 })] } }]);
    const b = tabbedPage([{ name: 'Overview', grid: { items: [widget('a', { x: 4 })] } }]);
    expect(layoutsEqual(a, b)).toBe(false);
  });
});
