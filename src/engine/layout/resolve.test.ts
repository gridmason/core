import type { LayoutPage, LayoutTab, LayoutWidget } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { resolveLayout, ResolveLayoutError } from './resolve.js';
import type { ResolveLayoutInputs } from './resolve.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
// Minimal, well-formed placed widgets and single-grid / tabbed LayoutDocs. The
// governance matrix distinguishes placements by (x, y): moving a slot changes
// its coordinates, so an assertion on the resolved item's x/y proves which
// level's placement won.

interface WidgetOpts {
  readonly slot?: string;
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly tag?: string;
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

/** The resolved single-grid items' `[slot|i, x, y]` triples, for compact assertions. */
function placements(layout: LayoutPage): [string, number, number][] {
  return layout.grid.items.map((item) => [item.slot ?? item.i, item.x, item.y]);
}

// ── No layout at all ──────────────────────────────────────────────────────────

describe('resolveLayout with no candidate layout', () => {
  test('throws ResolveLayoutError when every level is absent', () => {
    expect(() => resolveLayout({})).toThrow(ResolveLayoutError);
    expect(() => resolveLayout({ default: {}, org: { locks: ['header'] } })).toThrow(
      /at least one candidate layout/,
    );
  });
});

// ── Most-specific wins (the resolution matrix, SPEC §5) ───────────────────────

describe('most-specific wins', () => {
  test('default-only: the default layout is the effective layout', () => {
    const result = resolveLayout({ default: { layout: page([widget('a', { slot: 'header', x: 0 })]) } });
    expect(placements(result.layout)).toEqual([['header', 0, 0]]);
    expect(result.lockedSlots).toEqual([]);
  });

  test('default + org: org overrides a slot, inherits the rest', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 0 })]) },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]) },
    });
    // org moved `header` to x:6; `body` is silent at org, so it inherits default.
    expect(placements(result.layout)).toEqual([
      ['header', 6, 0],
      ['body', 0, 0],
    ]);
  });

  test('default + org + user: user is the most specific and wins per slot', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 0 })]) },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]) },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    });
    // user moved `header` to x:9 (beats org's x:6 and default's x:0); `body`
    // untouched by org and user, so default's placement survives.
    expect(placements(result.layout)).toEqual([
      ['header', 9, 0],
      ['body', 0, 0],
    ]);
  });

  test('org and user may be absent independently', () => {
    const orgOnly = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]) },
      user: { layout: page([widget('a', { slot: 'header', x: 3 })]) },
    });
    expect(placements(orgOnly.layout)).toEqual([['header', 3, 0]]);
  });

  test('a most-specific level adds a brand-new item', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]) },
      user: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('c', { slot: 'notes', x: 0, y: 4 })]) },
    });
    expect(placements(result.layout)).toEqual([
      ['header', 0, 0],
      ['notes', 0, 4],
    ]);
  });

  test('items without a slot are keyed and merged by their grid-item id', () => {
    const result = resolveLayout({
      default: { layout: page([widget('chart', { x: 0 })]) },
      user: { layout: page([widget('chart', { x: 7 })]) },
    });
    // Same `i` at both levels, no slot: user wins.
    expect(placements(result.layout)).toEqual([['chart', 7, 0]]);
  });
});

// ── Locked slots merge down (SPEC §5) ─────────────────────────────────────────

describe('locked slots merge down', () => {
  test('a slot locked at the default level cannot be moved by org or user', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]), locks: ['header'] },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]) },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    });
    // Locked at default → default's x:0 is fixed; org and user attempts ignored.
    expect(placements(result.layout)).toEqual([['header', 0, 0]]);
    expect(result.lockedSlots).toEqual(['header']);
  });

  test('a slot locked at the default level cannot be removed by a lower level', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 0, y: 4 })]), locks: ['header'] },
      user: { layout: page([widget('b', { slot: 'body', x: 0, y: 4 })]) },
    });
    // user omitted `header` (a removal attempt); the default lock re-inserts it.
    expect(placements(result.layout)).toEqual([
      ['body', 0, 4],
      ['header', 0, 0],
    ]);
  });

  test('a slot locked at the default level cannot be resized or replaced', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0, w: 4, tag: 'gm-summary' })]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'header', x: 0, w: 12, tag: 'gm-evil' })]) },
    });
    const header = result.layout.grid.items[0]!;
    expect(header.w).toBe(4); // resize ignored
    expect(header.widgetID.tag).toBe('gm-summary'); // replacement ignored
  });

  test('a slot locked at the org level fixes org placement for the user only', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]) },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    });
    // org owns the slot (locked at org): org's x:6 wins; user's x:9 ignored.
    expect(placements(result.layout)).toEqual([['header', 6, 0]]);
    expect(result.lockedSlots).toEqual(['header']);
  });

  test('a slot locked at the org level, not re-placed by org, holds the inherited default', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 2 })]) },
      org: { layout: page([]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    });
    // org locks `header` but is silent about it → the lock pins the inherited
    // default placement (x:2); the user's move is ignored.
    expect(placements(result.layout)).toEqual([['header', 2, 0]]);
  });

  test('the strongest (topmost) lock wins when both default and org lock a slot', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 1 })]), locks: ['header'] },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    });
    // Locked at default (index 0) beats the org lock: default's x:1 is fixed.
    expect(placements(result.layout)).toEqual([['header', 1, 0]]);
    // lockedSlots de-duplicates the overlapping default and org lock.
    expect(result.lockedSlots).toEqual(['header']);
  });

  test('a slot locked at default but never placed there is governed away', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'body', x: 0 })]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'body', x: 0 }), widget('h', { slot: 'header', x: 3 })]) },
    });
    // `header` is locked at default but default never placed it; the user cannot
    // introduce it below the lock, so it is omitted entirely.
    expect(placements(result.layout)).toEqual([['body', 0, 0]]);
    expect(result.lockedSlots).toEqual(['header']);
  });

  test('a user-level lock is ignored (nothing is below the user)', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]) },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]), locks: ['header'] },
    });
    // The user lock does not appear in lockedSlots and does not change the win.
    expect(placements(result.layout)).toEqual([['header', 9, 0]]);
    expect(result.lockedSlots).toEqual([]);
  });

  test('locked survivors are ordered by level then original position', () => {
    const result = resolveLayout({
      default: {
        layout: page([widget('a', { slot: 'alpha', x: 0 }), widget('c', { slot: 'gamma', x: 0, y: 8 })]),
        locks: ['alpha', 'gamma'],
      },
      org: { layout: page([widget('b', { slot: 'beta', x: 0, y: 4 })]), locks: ['beta'] },
      user: { layout: page([]) },
    });
    // The user base is empty; three locked slots survive. Ordering: ascending
    // level (default's alpha, gamma before org's beta) then original index.
    expect(placements(result.layout)).toEqual([
      ['alpha', 0, 0],
      ['gamma', 0, 8],
      ['beta', 0, 4],
    ]);
    expect(result.lockedSlots).toEqual(['alpha', 'gamma', 'beta']);
  });
});

// ── Tabbed layouts ────────────────────────────────────────────────────────────

describe('tabbed layouts', () => {
  test('governance composes within matching tabs, keyed by tab name', () => {
    const result = resolveLayout({
      default: {
        layout: tabbedPage([
          { name: 'Overview', grid: { items: [widget('a', { slot: 'header', x: 0 })] } },
          { name: 'Activity', grid: { items: [widget('b', { slot: 'feed', x: 0 })] } },
        ]),
        locks: ['header'],
      },
      user: {
        layout: tabbedPage([
          { name: 'Overview', grid: { items: [widget('a', { slot: 'header', x: 9 })] } },
          { name: 'Activity', grid: { items: [widget('b', { slot: 'feed', x: 5 })] } },
        ]),
      },
    });
    expect(result.layout.hasTabs).toBe(true);
    const [overview, activity] = result.layout.tabs;
    // `header` locked at default → x:0 kept; `feed` unlocked → user's x:5 wins.
    expect(overview!.grid.items[0]!.x).toBe(0);
    expect(activity!.grid.items[0]!.x).toBe(5);
  });

  test('a tab present only in the base is resolved without a matching upper scope', () => {
    const result = resolveLayout({
      default: {
        layout: tabbedPage([{ name: 'Overview', grid: { items: [widget('a', { slot: 'header', x: 0 })] } }]),
      },
      user: {
        layout: tabbedPage([
          { name: 'Overview', grid: { items: [widget('a', { slot: 'header', x: 3 })] } },
          { name: 'Extra', grid: { items: [widget('z', { slot: 'note', x: 0 })] } },
        ]),
      },
    });
    // The user base adds an `Extra` tab the default lacks; it resolves from the
    // user alone (default has no matching scope).
    const extra = result.layout.tabs.find((t) => t.name === 'Extra')!;
    expect(extra.grid.items[0]!.x).toBe(0);
  });

  test('a single-grid level contributes nothing to a tabbed base scope', () => {
    const result = resolveLayout({
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]) },
      user: {
        layout: tabbedPage([{ name: 'Overview', grid: { items: [widget('a', { slot: 'header', x: 4 })] } }]),
      },
    });
    // The default is single-grid but the user base is tabbed: within the tab
    // scope the default supplies no items, so the user's placement stands alone.
    expect(result.layout.hasTabs).toBe(true);
    expect(result.layout.tabs[0]!.grid.items[0]!.x).toBe(4);
  });
});

// ── Purity ────────────────────────────────────────────────────────────────────

describe('purity', () => {
  test('resolveLayout does not mutate its inputs', () => {
    const inputs: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 0, y: 4 })]), locks: ['header'] },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })]), locks: ['body'] },
      user: { layout: page([widget('a', { slot: 'header', x: 9 }), widget('b', { slot: 'body', x: 9, y: 4 })]) },
    };
    const before = structuredClone(inputs);
    resolveLayout(inputs);
    expect(inputs).toStrictEqual(before);
  });

  test('same inputs produce a deep-equal result each call', () => {
    const inputs: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header', x: 0 })]), locks: ['header'] },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })]) },
    };
    expect(resolveLayout(inputs)).toStrictEqual(resolveLayout(inputs));
  });
});
