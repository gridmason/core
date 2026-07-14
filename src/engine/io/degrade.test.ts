import type { LayoutPage, Manifest, WidgetID } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { WidgetCatalog } from '../catalog/index.js';
import {
  UNAVAILABLE_WIDGET_ID,
  catalogAvailability,
  degradeUnavailableWidgets,
} from './degrade.js';

/** A minimal valid widget manifest for `tag` under publisher `gm`. */
const manifest = (tag: string): Manifest => ({
  formatVersion: '1.0',
  tag,
  kind: 'widget',
  name: tag,
  publisher: 'gm',
  version: '1.0.0',
  entry: './widget.js',
});

const known: WidgetID = { source: 'local', tag: 'gm-known' };
const unknown: WidgetID = { source: 'local', tag: 'gm-unknown' };

const docWith = (items: LayoutPage['grid']['items']): LayoutPage => ({
  schemaVersion: 1,
  page: 'demo',
  name: 'Demo',
  default: true,
  hasTabs: false,
  grid: { items },
  tabs: [],
});

describe('degradeUnavailableWidgets', () => {
  test('anonymizes an unavailable widget and leaves available ones untouched', () => {
    const doc = docWith([
      { widgetID: known, i: 'a', x: 0, y: 0, w: 3, h: 2, props: { color: 'blue' }, slot: 'main' },
      { widgetID: unknown, i: 'b', x: 3, y: 0, w: 3, h: 2, props: { secret: true }, slot: 'header-summary' },
    ]);

    const result = degradeUnavailableWidgets(doc, (id) => id.tag === 'gm-known');

    expect(result.degradedCount).toBe(1);
    // The available widget is carried through unchanged (props/slot intact).
    expect(result.doc.grid.items[0]).toEqual(doc.grid.items[0]);
    // The unavailable one collapses to the anonymous placeholder; geometry + key
    // survive, identity/props/slot are dropped.
    expect(result.doc.grid.items[1]).toEqual({
      widgetID: UNAVAILABLE_WIDGET_ID,
      i: 'b',
      x: 3,
      y: 0,
      w: 3,
      h: 2,
    });
  });

  test('degrades unavailable widgets inside tab grids too', () => {
    const doc: LayoutPage = {
      ...docWith([]),
      hasTabs: true,
      tabs: [
        { name: 'One', grid: { items: [{ widgetID: unknown, i: 't', x: 0, y: 0, w: 1, h: 1 }] } },
        { name: 'Two', grid: { items: [{ widgetID: known, i: 'u', x: 0, y: 0, w: 1, h: 1 }] } },
      ],
    };

    const result = degradeUnavailableWidgets(doc, (id) => id.tag === 'gm-known');

    expect(result.degradedCount).toBe(1);
    expect(result.doc.tabs[0]!.grid.items[0]!.widgetID).toEqual(UNAVAILABLE_WIDGET_ID);
    expect(result.doc.tabs[0]!.name).toBe('One');
    expect(result.doc.tabs[1]!.grid.items[0]!.widgetID).toEqual(known);
  });

  test('never mutates the input document (pure projection)', () => {
    const doc = docWith([{ widgetID: unknown, i: 'a', x: 0, y: 0, w: 3, h: 2 }]);
    const before = structuredClone(doc);
    degradeUnavailableWidgets(doc, () => false);
    expect(doc).toEqual(before);
  });

  test('is a no-op count when everything is available', () => {
    const doc = docWith([{ widgetID: known, i: 'a', x: 0, y: 0, w: 3, h: 2 }]);
    const result = degradeUnavailableWidgets(doc, () => true);
    expect(result.degradedCount).toBe(0);
    expect(result.doc).toEqual(doc);
  });

  test('restores losslessly when the widget appears (re-run against the original)', () => {
    const doc = docWith([{ widgetID: known, i: 'a', x: 0, y: 0, w: 3, h: 2, props: { color: 'blue' } }]);

    const catalog = new WidgetCatalog();
    // First pass: catalog is empty → the widget is unavailable → anonymized.
    const first = degradeUnavailableWidgets(doc, catalogAvailability(catalog));
    expect(first.degradedCount).toBe(1);
    expect(first.doc.grid.items[0]!.widgetID).toEqual(UNAVAILABLE_WIDGET_ID);

    // The widget type appears; re-run against the untouched original.
    catalog.register('local', manifest('gm-known'));
    const second = degradeUnavailableWidgets(doc, catalogAvailability(catalog));
    expect(second.degradedCount).toBe(0);
    expect(second.doc.grid.items[0]).toEqual(doc.grid.items[0]);
  });
});

describe('catalogAvailability', () => {
  test('is available only for an exact source-qualified identity (SPEC §4)', () => {
    const catalog = new WidgetCatalog();
    catalog.register('local', manifest('gm-known'));
    const isAvailable = catalogAvailability(catalog);

    expect(isAvailable({ source: 'local', tag: 'gm-known' })).toBe(true);
    // Same tag, different source → not the same widget → unavailable.
    expect(isAvailable({ source: 'sideload:evil.dev', tag: 'gm-known' })).toBe(false);
    expect(isAvailable({ source: 'local', tag: 'gm-missing' })).toBe(false);
  });
});
