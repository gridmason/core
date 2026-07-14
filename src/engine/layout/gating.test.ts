import type { ContextMap, LayoutPage, LayoutTab, LayoutWidget, Manifest, WidgetID } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import type { WidgetGatingPorts } from '../picker/gating.js';

import { gateResolvedLayout, resolveAndGateLayout } from './gating.js';
import type { ResolutionGatingContext, WidgetManifestSource } from './gating.js';
import type { EffectiveLayout } from './resolve.js';
import { ResolveLayoutError } from './resolve.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
// A page providing a single `customer` record-ref context slot, plus manifests
// and placed instances keyed by tag. A persisted instance carries a full
// widgetID; the manifest source maps that identity back to the type's manifest.

const CUSTOMER_PAGE = {
  id: 'crm.customer-detail',
  context: { record: { type: 'record-ref', recordType: 'customer' } } satisfies ContextMap,
};

/** A valid widget manifest for `tag`; override fields per case. */
function manifest(tag: string, over: Partial<Manifest> = {}): Manifest {
  return {
    formatVersion: '1.0',
    tag,
    kind: 'widget',
    name: tag,
    publisher: 'acme',
    version: '1.0.0',
    entry: 'index.js',
    supportsPages: ['crm.*'],
    ...over,
  };
}

/** A persisted instance of the widget `tag` at key `i`. */
function widget(tag: string, i = tag): LayoutWidget {
  return { widgetID: { source: 'local', tag }, i, x: 0, y: 0, w: 4, h: 2 };
}

function page(items: readonly LayoutWidget[]): LayoutPage {
  return { schemaVersion: 1, page: CUSTOMER_PAGE.id, name: 'layout', default: false, hasTabs: false, grid: { items }, tabs: [] };
}

function tabbedPage(tabs: readonly LayoutTab[]): LayoutPage {
  return { schemaVersion: 1, page: CUSTOMER_PAGE.id, name: 'layout', default: false, hasTabs: true, grid: { items: [] }, tabs };
}

function effective(layout: LayoutPage, lockedSlots: readonly string[] = []): EffectiveLayout {
  return { layout, lockedSlots };
}

/** A manifest source backed by a `tag → Manifest` map; unknown tags return undefined. */
function manifestSource(...manifests: readonly Manifest[]): WidgetManifestSource {
  const byTag = new Map(manifests.map((m) => [m.tag, m]));
  return { manifestFor: (id: WidgetID) => byTag.get(id.tag) };
}

/** Ports that pass checks 3 and 4 for every widget. */
const ALLOW: WidgetGatingPorts = {
  gates: { isGateOn: () => true },
  permissions: { hasPermissions: () => true },
};

/** A gate port that turns off exactly the named tags. */
function gateOff(...tags: readonly string[]): WidgetGatingPorts['gates'] {
  const off = new Set(tags);
  return { isGateOn: (q) => !off.has(q.widget.tag) };
}

/** A permissions port that revokes exactly the named tags. */
function permRevoked(...tags: readonly string[]): WidgetGatingPorts['permissions'] {
  const revoked = new Set(tags);
  return { hasPermissions: (q) => !revoked.has(q.widget.tag) };
}

function context(over: Partial<ResolutionGatingContext> & Pick<ResolutionGatingContext, 'manifests'>): ResolutionGatingContext {
  return { pageType: CUSTOMER_PAGE, gates: ALLOW.gates, permissions: ALLOW.permissions, ...over };
}

/** The tags of the instances surviving in a single-grid effective layout. */
function tags(result: EffectiveLayout): string[] {
  return result.layout.grid.items.map((item) => item.widgetID.tag);
}

// ── Gate-off silent omission (AC 1) ───────────────────────────────────────────

describe('gateResolvedLayout — gate-off omission', () => {
  test('an instance whose gate is off is omitted with no placeholder left behind', () => {
    const input = effective(page([widget('gm-chart'), widget('gm-notes')]));
    const result = gateResolvedLayout(input, context({ manifests: manifestSource(manifest('gm-chart'), manifest('gm-notes')), gates: gateOff('gm-notes') }));
    // gm-notes is gone entirely — no card, name, slot marker, or reason remains.
    expect(tags(result)).toEqual(['gm-chart']);
    expect(result.layout.grid.items).toHaveLength(1);
    expect(JSON.stringify(result.layout)).not.toContain('gm-notes');
  });

  test('a revoked data permission omits the instance the same way (AC 3)', () => {
    const input = effective(page([widget('gm-chart'), widget('gm-notes')]));
    const result = gateResolvedLayout(input, context({ manifests: manifestSource(manifest('gm-chart'), manifest('gm-notes')), permissions: permRevoked('gm-chart') }));
    expect(tags(result)).toEqual(['gm-notes']);
  });

  test('a context mismatch and a supportsPages mismatch each omit the instance', () => {
    const input = effective(page([widget('needs-order'), widget('wrong-page'), widget('ok')]));
    const manifests = manifestSource(
      manifest('needs-order', { requiresContext: { record: { recordType: 'order' } } }),
      manifest('wrong-page', { supportsPages: ['billing.*'] }),
      manifest('ok'),
    );
    const result = gateResolvedLayout(input, context({ manifests }));
    expect(tags(result)).toEqual(['ok']);
  });
});

// ── Round-trip: saved doc untouched, re-enable restores (AC 2) ─────────────────

describe('gateResolvedLayout — non-destructive round-trip', () => {
  test('gate-off resolution leaves the saved doc byte-identical, and re-enabling restores the instance', () => {
    const saved = page([widget('gm-chart'), widget('gm-notes')]);
    const savedSnapshot = JSON.stringify(saved);
    const input = effective(saved);
    const manifests = manifestSource(manifest('gm-chart'), manifest('gm-notes'));

    // Gate gm-notes off: it is omitted from the effective layout...
    const gatedOff = gateResolvedLayout(input, context({ manifests, gates: gateOff('gm-notes') }));
    expect(tags(gatedOff)).toEqual(['gm-chart']);
    // ...but the saved doc — and the input effective layout — are unmutated.
    expect(JSON.stringify(saved)).toBe(savedSnapshot);
    expect(input.layout).toBe(saved);
    expect(input.layout.grid.items).toHaveLength(2);
    expect(gatedOff.layout).not.toBe(saved);

    // Re-enable the gate: the next resolution of the same saved doc includes it again.
    const restored = gateResolvedLayout(input, context({ manifests, gates: gateOff() }));
    expect(tags(restored)).toEqual(['gm-chart', 'gm-notes']);
  });

  test('lockedSlots governance metadata is carried through unchanged', () => {
    const input = effective(page([widget('gm-chart')]), ['header', 'footer']);
    const result = gateResolvedLayout(input, context({ manifests: manifestSource(manifest('gm-chart')) }));
    expect(result.lockedSlots).toEqual(['header', 'footer']);
  });
});

// ── Load failure is kept, not omitted (SPEC §6 distinction) ────────────────────

describe('gateResolvedLayout — unresolved type is a load failure, kept', () => {
  test('an instance whose type is not in the manifest source is retained for the C-E3 fallback', () => {
    const input = effective(page([widget('gm-chart'), widget('gm-unknown')]));
    // Only gm-chart is known; gm-unknown has no manifest — a load failure, kept.
    const result = gateResolvedLayout(input, context({ manifests: manifestSource(manifest('gm-chart')) }));
    expect(tags(result)).toEqual(['gm-chart', 'gm-unknown']);
  });
});

// ── Tabbed layouts ────────────────────────────────────────────────────────────

describe('gateResolvedLayout — tabbed layouts', () => {
  test('gating filters each tab independently and keeps an emptied tab', () => {
    const input = effective(
      tabbedPage([
        { name: 'overview', grid: { items: [widget('gm-chart'), widget('gm-notes')] } },
        { name: 'admin', grid: { items: [widget('gm-notes', 'notes2')] } },
      ]),
    );
    const result = gateResolvedLayout(input, context({ manifests: manifestSource(manifest('gm-chart'), manifest('gm-notes')), gates: gateOff('gm-notes') }));
    expect(result.layout.hasTabs).toBe(true);
    expect(result.layout.tabs.map((t) => t.name)).toEqual(['overview', 'admin']);
    expect(result.layout.tabs[0]!.grid.items.map((i) => i.widgetID.tag)).toEqual(['gm-chart']);
    // The admin tab loses its only widget but survives as an empty tab.
    expect(result.layout.tabs[1]!.grid.items).toEqual([]);
  });
});

// ── Integrated pipeline: resolveAndGateLayout ─────────────────────────────────

describe('resolveAndGateLayout — governance then gating', () => {
  test('composes levels then gates the survivors', () => {
    const result = resolveAndGateLayout(
      { default: { layout: page([widget('gm-chart'), widget('gm-notes')]) } },
      context({ manifests: manifestSource(manifest('gm-chart'), manifest('gm-notes')), gates: gateOff('gm-notes') }),
    );
    expect(tags(result)).toEqual(['gm-chart']);
  });

  test('propagates ResolveLayoutError when no level supplies a layout', () => {
    expect(() => resolveAndGateLayout({}, context({ manifests: manifestSource() }))).toThrow(ResolveLayoutError);
  });
});
