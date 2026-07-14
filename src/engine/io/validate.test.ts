import type { LayoutPage } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { validateLayoutDoc } from './validate.js';

// The negative cases feed untrusted values, so inputs are built as plain object
// literals (the validator takes `unknown`) rather than mutating a typed, deeply
// `readonly` LayoutPage. `widget`/`base` return fresh deep structures each call.
type Obj = Record<string, unknown>;

const widget = (over: Obj = {}): Obj => ({
  widgetID: { source: 'local', tag: 'gm-chart' },
  i: 'a',
  x: 0,
  y: 0,
  w: 3,
  h: 2,
  ...over,
});

const base = (over: Obj = {}): Obj => ({
  schemaVersion: 1,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: { items: [widget()] },
  tabs: [],
  ...over,
});

describe('validateLayoutDoc — well-formed documents', () => {
  test('accepts a minimal single-grid document and returns it typed', () => {
    const expected: LayoutPage = {
      schemaVersion: 1,
      page: 'crm.customer-detail',
      name: 'Customer overview',
      default: true,
      hasTabs: false,
      grid: { items: [{ widgetID: { source: 'local', tag: 'gm-chart' }, i: 'a', x: 0, y: 0, w: 3, h: 2 }] },
      tabs: [],
    };
    const result = validateLayoutDoc(base());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(expected);
  });

  test('accepts a tabbed document with populated tab grids', () => {
    const doc = base({
      hasTabs: true,
      grid: { items: [] },
      tabs: [
        { name: 'Overview', grid: { items: [] } },
        { name: 'Details', grid: { items: [widget({ widgetID: { source: 'local', tag: 'gm-table' }, i: 't1' })] } },
      ],
    });
    expect(validateLayoutDoc(doc).ok).toBe(true);
  });

  test('accepts optional props and slot on a widget, and ignores unknown extra fields', () => {
    const doc = base({
      extra: 'ignored', // an additive field from a hypothetical newer minor
      grid: { items: [widget({ props: { color: 'blue' }, slot: 'header-summary' })] },
    });
    expect(validateLayoutDoc(doc).ok).toBe(true);
  });

  test('accepts a widget with props explicitly undefined and slot absent', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ props: undefined })] } })).ok).toBe(true);
  });
});

describe('validateLayoutDoc — root shape', () => {
  test.each([
    ['a string', 'nope'],
    ['null', null],
    ['an array', []],
    ['a number', 42],
  ])('rejects a root that is %s', (_label, value) => {
    expect(validateLayoutDoc(value)).toEqual({
      ok: false,
      error: { code: 'not-an-object', message: expect.any(String), path: '' },
    });
  });
});

describe('validateLayoutDoc — schemaVersion', () => {
  test('rejects a missing schemaVersion', () => {
    const doc = base();
    delete doc.schemaVersion;
    expect(validateLayoutDoc(doc)).toMatchObject({ ok: false, error: { code: 'missing-field', path: 'schemaVersion' } });
  });

  test.each([
    ['a non-number', '1'],
    ['a non-integer', 1.5],
    ['zero', 0],
    ['negative', -3],
    ['NaN', Number.NaN],
  ])('rejects schemaVersion that is %s', (_label, value) => {
    expect(validateLayoutDoc(base({ schemaVersion: value }))).toMatchObject({
      ok: false,
      error: { code: 'bad-schema-version', path: 'schemaVersion' },
    });
  });
});

describe('validateLayoutDoc — top-level scalars', () => {
  test('rejects a missing page', () => {
    const doc = base();
    delete doc.page;
    expect(validateLayoutDoc(doc)).toMatchObject({ ok: false, error: { code: 'missing-field', path: 'page' } });
  });

  test('rejects a non-string page', () => {
    expect(validateLayoutDoc(base({ page: 7 }))).toMatchObject({ ok: false, error: { code: 'wrong-type', path: 'page' } });
  });

  test('rejects an empty page', () => {
    expect(validateLayoutDoc(base({ page: '' }))).toMatchObject({ ok: false, error: { code: 'empty-string', path: 'page' } });
  });

  test('accepts an empty name (display-only, not an identity)', () => {
    expect(validateLayoutDoc(base({ name: '' })).ok).toBe(true);
  });

  test('rejects a non-string name', () => {
    expect(validateLayoutDoc(base({ name: 7 }))).toMatchObject({ ok: false, error: { code: 'wrong-type', path: 'name' } });
  });

  test('rejects a non-boolean default', () => {
    expect(validateLayoutDoc(base({ default: 'yes' }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'default' },
    });
  });

  test('rejects a missing default', () => {
    const doc = base();
    delete doc.default;
    expect(validateLayoutDoc(doc)).toMatchObject({ ok: false, error: { code: 'missing-field', path: 'default' } });
  });

  test('rejects a non-boolean hasTabs', () => {
    expect(validateLayoutDoc(base({ hasTabs: 1 }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'hasTabs' },
    });
  });
});

describe('validateLayoutDoc — grid and widgets', () => {
  test('rejects a missing grid', () => {
    const doc = base();
    delete doc.grid;
    expect(validateLayoutDoc(doc)).toMatchObject({ ok: false, error: { code: 'missing-field', path: 'grid' } });
  });

  test('rejects a non-object grid', () => {
    expect(validateLayoutDoc(base({ grid: 'x' }))).toMatchObject({ ok: false, error: { code: 'not-an-object', path: 'grid' } });
  });

  test('rejects a grid missing items', () => {
    expect(validateLayoutDoc(base({ grid: {} }))).toMatchObject({
      ok: false,
      error: { code: 'missing-field', path: 'grid.items' },
    });
  });

  test('rejects grid items that are not an array', () => {
    expect(validateLayoutDoc(base({ grid: { items: {} } }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'grid.items' },
    });
  });

  test('rejects a non-object widget, pathed by index', () => {
    expect(validateLayoutDoc(base({ grid: { items: [null] } }))).toMatchObject({
      ok: false,
      error: { code: 'not-an-object', path: 'grid.items[0]' },
    });
  });

  test('rejects a widget missing widgetID', () => {
    const item = widget();
    delete item.widgetID;
    expect(validateLayoutDoc(base({ grid: { items: [item] } }))).toMatchObject({
      ok: false,
      error: { code: 'missing-field', path: 'grid.items[0].widgetID' },
    });
  });

  test('rejects a non-object widgetID', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ widgetID: 'local:gm-chart' })] } }))).toMatchObject({
      ok: false,
      error: { code: 'not-an-object', path: 'grid.items[0].widgetID' },
    });
  });

  test('rejects a widgetID with a missing source', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ widgetID: { tag: 'gm-chart' } })] } }))).toMatchObject({
      ok: false,
      error: { code: 'missing-field', path: 'grid.items[0].widgetID.source' },
    });
  });

  test('rejects a widgetID with an empty tag', () => {
    expect(
      validateLayoutDoc(base({ grid: { items: [widget({ widgetID: { source: 'local', tag: '' } })] } })),
    ).toMatchObject({ ok: false, error: { code: 'empty-string', path: 'grid.items[0].widgetID.tag' } });
  });

  test('rejects a widget with an empty instance key i', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ i: '' })] } }))).toMatchObject({
      ok: false,
      error: { code: 'empty-string', path: 'grid.items[0].i' },
    });
  });

  test('rejects a non-number coordinate', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ x: '0' })] } }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'grid.items[0].x' },
    });
  });

  test('rejects a non-finite coordinate', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ h: Number.POSITIVE_INFINITY })] } }))).toMatchObject({
      ok: false,
      error: { code: 'not-finite', path: 'grid.items[0].h' },
    });
  });

  test('rejects non-object props when present', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ props: 'nope' })] } }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'grid.items[0].props' },
    });
  });

  test('rejects a non-string slot when present', () => {
    expect(validateLayoutDoc(base({ grid: { items: [widget({ slot: 5 })] } }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'grid.items[0].slot' },
    });
  });
});

describe('validateLayoutDoc — tabs', () => {
  test('rejects a missing tabs', () => {
    const doc = base();
    delete doc.tabs;
    expect(validateLayoutDoc(doc)).toMatchObject({ ok: false, error: { code: 'missing-field', path: 'tabs' } });
  });

  test('rejects tabs that are not an array', () => {
    expect(validateLayoutDoc(base({ tabs: {} }))).toMatchObject({ ok: false, error: { code: 'wrong-type', path: 'tabs' } });
  });

  test('rejects a non-object tab, pathed by index', () => {
    expect(validateLayoutDoc(base({ hasTabs: true, tabs: ['x'] }))).toMatchObject({
      ok: false,
      error: { code: 'not-an-object', path: 'tabs[0]' },
    });
  });

  test('rejects a tab with a non-string name', () => {
    expect(validateLayoutDoc(base({ hasTabs: true, tabs: [{ name: 7, grid: { items: [] } }] }))).toMatchObject({
      ok: false,
      error: { code: 'wrong-type', path: 'tabs[0].name' },
    });
  });

  test('rejects a tab with a missing grid', () => {
    expect(validateLayoutDoc(base({ hasTabs: true, tabs: [{ name: 'Overview' }] }))).toMatchObject({
      ok: false,
      error: { code: 'missing-field', path: 'tabs[0].grid' },
    });
  });

  test('rejects a malformed widget inside a tab grid, with the full nested path', () => {
    const item = widget();
    delete item.h;
    const doc = base({ hasTabs: true, tabs: [{ name: 'Overview', grid: { items: [item] } }] });
    expect(validateLayoutDoc(doc)).toMatchObject({
      ok: false,
      error: { code: 'missing-field', path: 'tabs[0].grid.items[0].h' },
    });
  });
});
