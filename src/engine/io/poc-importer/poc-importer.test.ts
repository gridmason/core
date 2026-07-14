import { readFileSync } from 'node:fs';

import type { Manifest } from '@gridmason/protocol';
import { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { WidgetCatalog } from '../../catalog/index.js';
import { PageTypeRegistry } from '../../page-types/index.js';
import { catalogAvailability, UNAVAILABLE_WIDGET_ID } from '../degrade.js';
import {
  importPocLayouts,
  POC_DEMO_PAGE_TYPE,
  POC_LAYOUTS_STORAGE_KEY,
  toRenderablePocLayout,
} from './index.js';

// The real `s7k-widgets-core` localStorage dump checked into the repo — the
// exact string the POC persists under `$widgetLayouts` (FR-14).
const FIXTURE = readFileSync(
  new URL('../../../../fixtures/s7k-widgets-core/dashboard-export.json', import.meta.url),
  'utf8',
);

/** A minimal valid widget manifest for `tag` under publisher `acme`. */
const manifest = (tag: string): Manifest => ({
  formatVersion: '1.0',
  tag,
  kind: 'widget',
  name: tag,
  publisher: 'acme',
  version: '1.0.0',
  entry: './widget.js',
});

/** A catalog that has the two host-known demo widgets, plus any extra tags. */
const hostCatalog = (...extraTags: string[]): WidgetCatalog => {
  const catalog = new WidgetCatalog();
  for (const tag of ['acme-clock', 'acme-notes', ...extraTags]) {
    catalog.register('local', manifest(tag));
  }
  return catalog;
};

describe('importPocLayouts', () => {
  test('converts the real POC dump into current-version LayoutDocs', () => {
    const result = importPocLayouts(FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pages).toHaveLength(2);
    const index = result.pages[0]!;
    const reports = result.pages[1]!;

    // Every converted doc is at the current schema version (migrate-on-read),
    // and the converter stamped it there directly (v0 POC → v1 baseline).
    expect(index.page).toBe('index');
    expect(index.doc.schemaVersion).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
    expect(index.loadedFrom).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
    expect(index.migrated).toBe(false);

    // The single-grid page's three widgets survive with source-qualified identity.
    expect(index.doc.hasTabs).toBe(false);
    expect(index.doc.grid.items.map((it) => it.widgetID)).toEqual([
      { source: 'local', tag: 'acme-clock' },
      { source: 'local', tag: 'acme-notes' },
      { source: 'local', tag: 'acme-market-ticker' },
    ]);

    // Geometry + key + per-instance props are carried; the POC's `name`/`moved`
    // presentation fields and node uuids are dropped.
    const notes = index.doc.grid.items[1];
    expect(notes).toEqual({
      widgetID: { source: 'local', tag: 'acme-notes' },
      i: 'c1f0a2b3-0002-4a00-8000-000000000002',
      x: 1,
      y: 0,
      w: 2,
      h: 2,
      props: { text: 'Remember to water the plants', color: 'amber' },
    });
    expect(notes).not.toHaveProperty('name');
    expect(notes).not.toHaveProperty('moved');
    expect(index.doc).not.toHaveProperty('id');

    // The tabbed page maps every tab grid, including a bare-uuid POC widgetID.
    expect(reports.page).toBe('reports');
    expect(reports.doc.hasTabs).toBe(true);
    expect(reports.doc.tabs.map((t) => t.name)).toEqual(['Overview', 'Legacy']);
    expect(reports.doc.tabs[1]!.grid.items[0]!.widgetID).toEqual({
      source: 'local',
      tag: 'd287d3bc-94e9-4b6d-91ce-ef4bfced75ff',
    });
  });

  test('rejects a storage value that is not JSON without echoing its bytes', () => {
    const result = importPocLayouts('acme-clock}{ not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid-json');
    expect(result.error.path).toBe('');
    expect(result.error.message).toContain(POC_LAYOUTS_STORAGE_KEY);
    expect(result.error.message).not.toContain('acme-clock');
  });

  test('surfaces the protocol converter error for a malformed payload', () => {
    // The `$widgetLayouts` value must be an array of pages.
    const result = importPocLayouts(JSON.stringify({ not: 'an array' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not-an-array');
  });

  test('runs each converted doc through the migrate-on-read chain to the target', () => {
    // A caller-supplied registry with a v1→v2 step: the boundary output (v1) is
    // migrated forward through the same pipeline any stored layout takes on load.
    const registry = new MigratorRegistry().register({
      fromVersion: 1,
      migrate: (doc) => ({ ...doc, schemaVersion: 2 }),
    });
    const result = importPocLayouts(FIXTURE, { registry, target: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const page of result.pages) {
      expect(page.doc.schemaVersion).toBe(2);
      expect(page.loadedFrom).toBe(1);
      expect(page.migrated).toBe(true);
    }
  });

  test('fails read-only when a converted doc cannot be upgraded to the target', () => {
    // Target v2 with the shipped (v1-floored, empty) chain: no 1→2 migrator, so the
    // migrate-on-read pipeline returns read-only rather than a destructive rewrite.
    const result = importPocLayouts(FIXTURE, { target: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('read-only');
    expect(result.error.path).toBe('[0]');
  });
});

describe('toRenderablePocLayout', () => {
  test('resolves an imported page and degrades widgets the host lacks', () => {
    const result = importPocLayouts(FIXTURE);
    if (!result.ok) throw new Error('fixture failed to import');
    const index = result.pages[0]!.doc;

    // Host has clock + notes but not the market ticker → one anonymous card.
    const rendered = toRenderablePocLayout(index, catalogAvailability(hostCatalog()));
    expect(rendered.degradedCount).toBe(1);
    expect(rendered.effective.lockedSlots).toEqual([]);

    const items = rendered.effective.layout.grid.items;
    expect(items).toHaveLength(3);
    expect(items[0]!.widgetID).toEqual({ source: 'local', tag: 'acme-clock' });
    // The unavailable widget collapses to the shared anonymous placeholder,
    // dropping its identity and props; geometry + key survive.
    expect(items[2]).toEqual({
      widgetID: UNAVAILABLE_WIDGET_ID,
      i: 'c1f0a2b3-0003-4a00-8000-000000000003',
      x: 0,
      y: 1,
      w: 1,
      h: 1,
    });
  });

  test('degrades nothing when the host has every referenced widget', () => {
    const result = importPocLayouts(FIXTURE);
    if (!result.ok) throw new Error('fixture failed to import');
    const index = result.pages[0]!.doc;

    const rendered = toRenderablePocLayout(index, catalogAvailability(hostCatalog('acme-market-ticker')));
    expect(rendered.degradedCount).toBe(0);
    expect(rendered.effective.layout.grid.items.map((it) => it.widgetID.tag)).toEqual([
      'acme-clock',
      'acme-notes',
      'acme-market-ticker',
    ]);
  });
});

describe('POC_DEMO_PAGE_TYPE', () => {
  test('registers as a valid demo page type the imported layout renders on', () => {
    const registry = new PageTypeRegistry();
    const registered = registry.register(POC_DEMO_PAGE_TYPE);
    expect(registered.id).toBe('gridmason.poc-demo');
    expect(registered.allow_user_customization).toBe(true);
    expect(registered.pages).toEqual(['.*']);
    expect(registry.get('gridmason.poc-demo')).toBe(registered);
  });
});
