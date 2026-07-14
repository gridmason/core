import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { cloneLayout, forkOnEdit, resetLevel, scopeKeyString } from './fork.js';
import type { ScopeKey } from './fork.js';
import { resolveLayout } from './resolve.js';
import type { ResolveLayoutInputs } from './resolve.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface WidgetOpts {
  readonly slot?: string;
  readonly x?: number;
  readonly y?: number;
}

function widget(i: string, opts: WidgetOpts = {}): LayoutWidget {
  return {
    widgetID: { source: 'local', tag: 'gm-card' },
    i,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w: 4,
    h: 2,
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

/** A widget whose object keys are written in a deliberately different order. */
function reorderedKeysWidget(i: string, x: number): LayoutWidget {
  return { h: 2, x, w: 4, i, y: 0, widgetID: { tag: 'gm-card', source: 'local' } } as LayoutWidget;
}

// ── scopeKeyString ────────────────────────────────────────────────────────────

describe('scopeKeyString', () => {
  test('encodes user and org-node owners, with and without an entityId', () => {
    expect(scopeKeyString({ owner: 'user', pageType: 'crm.customer-detail' })).toBe(
      'user|crm.customer-detail',
    );
    expect(
      scopeKeyString({ owner: 'user', pageType: 'crm.customer-detail', entityId: 'acct-9' }),
    ).toBe('user|crm.customer-detail|acct-9');
    expect(scopeKeyString({ owner: { node: 'team-a' }, pageType: 'crm.customer-detail' })).toBe(
      'node:team-a|crm.customer-detail',
    );
    expect(
      scopeKeyString({ owner: { node: 'team-a' }, pageType: 'crm.customer-detail', entityId: 'acct-9' }),
    ).toBe('node:team-a|crm.customer-detail|acct-9');
  });

  test('is determined solely by the key fields', () => {
    const a: ScopeKey = { owner: { node: 'team-a' }, pageType: 'p', entityId: 'e' };
    const b: ScopeKey = { entityId: 'e', pageType: 'p', owner: { node: 'team-a' } };
    expect(scopeKeyString(a)).toBe(scopeKeyString(b));
  });
});

// ── cloneLayout ───────────────────────────────────────────────────────────────

describe('cloneLayout', () => {
  test('returns a structurally equal but fully detached copy', () => {
    const original = page([widget('a', { slot: 'header' })]);
    const clone = cloneLayout(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.grid.items[0]).not.toBe(original.grid.items[0]);
  });
});

// ── forkOnEdit: copy-on-write (FR-5) ──────────────────────────────────────────

describe('forkOnEdit', () => {
  test('AC: the first genuine edit of an inherited layout forks a personal copy', () => {
    // The user inherits from default + org (no user level yet).
    const base: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 0, y: 4 })], 'default') },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })], 'org') },
    };
    const inherited = resolveLayout(base).layout;

    // They move `header`, producing a genuinely different candidate.
    const edited = page(
      inherited.grid.items.map((item) => (item.slot === 'header' ? { ...item, x: 9 } : item)),
    );

    const result = forkOnEdit(inherited, edited);
    expect(result.forked).toBe(true);
    if (result.forked) {
      // The fork is a detached copy stored at the user level.
      expect(result.layout).toEqual(edited);
      expect(result.layout).not.toBe(edited);
      const forked = resolveLayout({ ...base, user: { layout: result.layout } }).layout;
      expect(forked.grid.items.find((i) => i.slot === 'header')?.x).toBe(9);
    }
  });

  test('AC: reorder-only / whitespace-only re-serialization does NOT fork', () => {
    const inherited = page([widget('a', { slot: 'header', x: 0 }), widget('b', { slot: 'body', x: 6 })], 'default');
    // Same layout after a load + re-serialize: items reordered, object keys in a
    // different order, and the doc's own metadata (name/default) changed.
    const reserialized = page(
      [reorderedKeysWidget('b', 6), reorderedKeysWidget('a', 0)].map((w) =>
        w.i === 'a' ? { ...w, slot: 'header' } : { ...w, slot: 'body' },
      ),
      'user',
    );
    const result = forkOnEdit(inherited, reserialized);
    expect(result.forked).toBe(false);
  });

  test('an edit that adds a widget forks', () => {
    const inherited = page([widget('a', { slot: 'header' })]);
    const edited = page([widget('a', { slot: 'header' }), widget('c', { slot: 'notes', y: 4 })]);
    expect(forkOnEdit(inherited, edited).forked).toBe(true);
  });
});

// ── resetLevel: reset-to-default at every level (FR-5) ─────────────────────────

describe('resetLevel', () => {
  test('AC: reset drops the user layout and resolution returns the upstream layout', () => {
    const inputs: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header', x: 0 })], 'default') },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })], 'org') },
      user: { layout: page([widget('a', { slot: 'header', x: 9 })], 'user') },
    };
    // With the user layout, `header` sits at the user's x:9.
    expect(resolveLayout(inputs).layout.grid.items[0]?.x).toBe(9);

    const afterReset = resetLevel(inputs, 'user');
    expect(afterReset.user?.layout).toBeUndefined();
    // Resolution now falls back to the upstream (org) layout: x:6.
    expect(resolveLayout(afterReset).layout.grid.items[0]?.x).toBe(6);
  });

  test('reset at the org level preserves the org locks it declared', () => {
    const inputs: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header', x: 0 })], 'default') },
      org: { layout: page([widget('a', { slot: 'header', x: 6 })], 'org'), locks: ['header'] },
    };
    const afterReset = resetLevel(inputs, 'org');
    expect(afterReset.org?.layout).toBeUndefined();
    expect(afterReset.org?.locks).toEqual(['header']);
    // The org's layout is gone (falls back to default x:0) but its lock stands.
    const resolved = resolveLayout(afterReset);
    expect(resolved.layout.grid.items[0]?.x).toBe(0);
    expect(resolved.lockedSlots).toEqual(['header']);
  });

  test('resetting a level with no layout is a no-op that returns the same inputs', () => {
    const inputs: ResolveLayoutInputs = {
      default: { layout: page([widget('a', { slot: 'header' })], 'default') },
      org: { locks: ['header'] },
    };
    // Level entirely absent (user) and level present-but-layout-less (org).
    expect(resetLevel(inputs, 'user')).toBe(inputs);
    expect(resetLevel(inputs, 'org')).toBe(inputs);
  });
});
