import type { Manifest, WidgetID } from '@gridmason/protocol';
import { describe, expect, test, vi } from 'vitest';

import { WidgetCatalog } from './catalog.js';

/** A valid widget manifest; override fields per case. Publisher-prefixed tag. */
function widget(over: Partial<Manifest> = {}): Manifest {
  return {
    formatVersion: '1.0',
    tag: 'acme-sales-chart',
    kind: 'widget',
    name: 'Sales Chart',
    publisher: 'acme',
    version: '1.0.0',
    entry: 'index.js',
    ...over,
  };
}

const LOCAL = 'local';
const REGISTRY = 'registry.gridmason.dev';
const SIDELOAD = 'sideload:https://widgets.example';

describe('WidgetCatalog registration', () => {
  test('registers a valid widget under its source-qualified identity', () => {
    const catalog = new WidgetCatalog();
    const result = catalog.register(LOCAL, widget());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.entry.id).toEqual<WidgetID>({ source: LOCAL, tag: 'acme-sales-chart' });
    expect(result.entry.manifest.name).toBe('Sales Chart');
    expect(catalog.size).toBe(1);
  });

  test('exposes a registered widget by identity and by tag', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());

    const id: WidgetID = { source: LOCAL, tag: 'acme-sales-chart' };
    expect(catalog.has(id)).toBe(true);
    expect(catalog.get(id)?.manifest.name).toBe('Sales Chart');
    expect(catalog.getByTag('acme-sales-chart')?.id).toEqual(id);
  });

  test('does not resolve a tag registered under a different source', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());

    const otherId: WidgetID = { source: REGISTRY, tag: 'acme-sales-chart' };
    expect(catalog.has(otherId)).toBe(false);
    expect(catalog.get(otherId)).toBeUndefined();
  });

  test('returns undefined for unknown identity and tag', () => {
    const catalog = new WidgetCatalog();
    expect(catalog.get({ source: LOCAL, tag: 'acme-missing' })).toBeUndefined();
    expect(catalog.has({ source: LOCAL, tag: 'acme-missing' })).toBe(false);
    expect(catalog.getByTag('acme-missing')).toBeUndefined();
  });
});

describe('WidgetCatalog collision refusal (SPEC §4)', () => {
  test('refuses a duplicate identity (same source, same tag) with telemetry', () => {
    const telemetry = vi.fn();
    const catalog = new WidgetCatalog({ telemetry });
    catalog.register(LOCAL, widget());

    const result = catalog.register(LOCAL, widget({ name: 'Impostor' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.event.reason).toBe('duplicate-identity');
    expect(result.event.attempted).toEqual<WidgetID>({ source: LOCAL, tag: 'acme-sales-chart' });
    expect(result.event.incumbent).toEqual<WidgetID>({ source: LOCAL, tag: 'acme-sales-chart' });
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledWith(result.event);
    // The original registration is untouched.
    expect(catalog.size).toBe(1);
    expect(catalog.getByTag('acme-sales-chart')?.manifest.name).toBe('Sales Chart');
  });

  test('refuses a bound tag claimed by a second source with telemetry', () => {
    const telemetry = vi.fn();
    const catalog = new WidgetCatalog({ telemetry });
    catalog.register(LOCAL, widget());

    const result = catalog.register(REGISTRY, widget({ name: 'Impersonator' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.event.reason).toBe('tag-owned-by-other-source');
    expect(result.event.attempted).toEqual<WidgetID>({ source: REGISTRY, tag: 'acme-sales-chart' });
    expect(result.event.incumbent).toEqual<WidgetID>({ source: LOCAL, tag: 'acme-sales-chart' });
    expect(result.event.tagViolations).toBeUndefined();
    expect(telemetry).toHaveBeenCalledTimes(1);
    // The tag still resolves to its original owner — no silent impersonation.
    expect(catalog.getByTag('acme-sales-chart')?.id.source).toBe(LOCAL);
    expect(catalog.size).toBe(1);
  });

  test('refuses without throwing when no telemetry sink is configured', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());

    const result = catalog.register(REGISTRY, widget());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.event.reason).toBe('tag-owned-by-other-source');
  });
});

describe('WidgetCatalog manifest guards', () => {
  test('refuses a tag that fails the tag lint, carrying the violations', () => {
    const telemetry = vi.fn();
    const catalog = new WidgetCatalog({ telemetry });

    // Structurally valid custom-element name, but not prefixed with `publisher`.
    const result = catalog.register(LOCAL, widget({ tag: 'notacme-widget', publisher: 'acme' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.event.reason).toBe('invalid-tag');
    expect(result.event.tagViolations?.some((v) => v.code === 'missing-publisher-prefix')).toBe(true);
    expect(result.event.incumbent).toBeUndefined();
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(catalog.size).toBe(0);
  });

  test('refuses a manifest whose kind is not a widget', () => {
    const telemetry = vi.fn();
    const catalog = new WidgetCatalog({ telemetry });

    const result = catalog.register(LOCAL, widget({ tag: 'acme-crm-page', kind: 'page-type' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.event.reason).toBe('not-a-widget');
    expect(result.event.incumbent).toBeUndefined();
    expect(result.event.tagViolations).toBeUndefined();
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(catalog.size).toBe(0);
  });
});

describe('WidgetCatalog removal', () => {
  test('unregisters an entry and frees its tag for any source', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());

    expect(catalog.unregister({ source: LOCAL, tag: 'acme-sales-chart' })).toBe(true);
    expect(catalog.size).toBe(0);
    expect(catalog.getByTag('acme-sales-chart')).toBeUndefined();

    // A previously-refused source can now claim the freed tag.
    const reclaimed = catalog.register(REGISTRY, widget());
    expect(reclaimed.ok).toBe(true);
    expect(catalog.getByTag('acme-sales-chart')?.id.source).toBe(REGISTRY);
  });

  test('returns false when unregistering an unknown identity', () => {
    const catalog = new WidgetCatalog();
    expect(catalog.unregister({ source: LOCAL, tag: 'acme-missing' })).toBe(false);
  });

  test('does not unregister a tag owned by a different source', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());

    expect(catalog.unregister({ source: REGISTRY, tag: 'acme-sales-chart' })).toBe(false);
    expect(catalog.getByTag('acme-sales-chart')?.id.source).toBe(LOCAL);
    expect(catalog.size).toBe(1);
  });

  test('clear empties the catalog and the tag namespace', () => {
    const catalog = new WidgetCatalog();
    catalog.register(LOCAL, widget());
    catalog.register(REGISTRY, widget({ tag: 'beta-grid', publisher: 'beta' }));

    catalog.clear();
    expect(catalog.size).toBe(0);
    expect(catalog.list()).toEqual([]);
    expect(catalog.getByTag('acme-sales-chart')).toBeUndefined();
  });
});

describe('WidgetCatalog listing', () => {
  test('lists entries ordered by source-qualified identity', () => {
    const catalog = new WidgetCatalog();
    // Registered out of order; local < registry < sideload, then by tag.
    catalog.register(SIDELOAD, widget({ tag: 'zed-three', publisher: 'zed' }));
    catalog.register(LOCAL, widget({ tag: 'acme-one', publisher: 'acme' }));
    catalog.register(REGISTRY, widget({ tag: 'beta-two', publisher: 'beta' }));

    expect(catalog.list().map((e) => e.id)).toEqual<WidgetID[]>([
      { source: LOCAL, tag: 'acme-one' },
      { source: REGISTRY, tag: 'beta-two' },
      { source: SIDELOAD, tag: 'zed-three' },
    ]);
  });
});
