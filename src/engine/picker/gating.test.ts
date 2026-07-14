import type { Capability, ContextMap, Manifest } from '@gridmason/protocol';
import { describe, expect, test, vi } from 'vitest';

import type { WidgetCatalogEntry } from '../catalog/index.js';

import type { WidgetGatingPorts } from './gating.js';
import { eligibleWidgets, isWidgetEligible } from './gating.js';

/** A valid widget manifest; override fields per case. */
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

/** A catalog entry wrapping {@link widget}, keyed by a source-qualified identity. */
function entry(over: Partial<Manifest> = {}, source = 'local'): WidgetCatalogEntry {
  const manifest = widget(over);
  return { id: { source, tag: manifest.tag }, manifest };
}

/** Ports that pass checks 3 and 4 for every widget. */
const ALLOW: WidgetGatingPorts = {
  gates: { isGateOn: () => true },
  permissions: { hasPermissions: () => true },
};

/** A page providing a single `customer` record-ref context slot. */
const CUSTOMER_PAGE = {
  id: 'crm.customer-detail',
  context: { record: { type: 'record-ref', recordType: 'customer' } } satisfies ContextMap,
};

describe('isWidgetEligible — all four checks', () => {
  test('a widget passing all four checks is eligible', () => {
    const w = entry({ requiresContext: { record: { recordType: 'customer' } }, supportsPages: ['crm.*'] });
    expect(isWidgetEligible({ manifest: w.manifest, widget: w.id, pageType: CUSTOMER_PAGE, ...ALLOW })).toBe(true);
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([w]);
  });
});

describe('check 1 — requiresContext ⊆ page context', () => {
  test('a required record-ref of the wrong recordType hides the widget', () => {
    const w = entry({ requiresContext: { record: { recordType: 'order' } }, supportsPages: ['crm.*'] });
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([]);
  });

  test('a required slot the page does not declare hides the widget', () => {
    const w = entry({ requiresContext: { missing: { recordType: 'customer' } }, supportsPages: ['crm.*'] });
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([]);
  });

  test('a presence-only requirement passes when the page declares the slot', () => {
    const w = entry({ requiresContext: { record: {} }, supportsPages: ['crm.*'] });
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([w]);
  });

  test('a widget with no requiresContext requires nothing', () => {
    const w = entry({ supportsPages: ['crm.*'] });
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([w]);
  });
});

describe('check 2 — supportsPages glob via the safe matcher', () => {
  test('a supportsPages that does not match the page id hides the widget', () => {
    const w = entry({ supportsPages: ['dashboards.*'] });
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([]);
  });

  test('an omitted supportsPages places the widget on any page', () => {
    const w = entry();
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([w]);
  });

  test('matching treats regex metacharacters literally, never as a RegExp', () => {
    // The `.` in the glob is a literal dot. Were it compiled to a RegExp,
    // `crm.customer-detail` would also match `crmXcustomer-detail`.
    const w = entry({ supportsPages: ['crm.customer-detail'] });
    const impostor = { id: 'crmXcustomer-detail', context: CUSTOMER_PAGE.context };
    expect(eligibleWidgets([w], impostor, ALLOW)).toEqual([]);
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ALLOW)).toEqual([w]);
  });
});

describe('checks 3 & 4 — gate and permission ports', () => {
  test('a widget whose gate is off is hidden', () => {
    const w = entry({ supportsPages: ['crm.*'] });
    const ports: WidgetGatingPorts = {
      gates: { isGateOn: () => false },
      permissions: { hasPermissions: () => true },
    };
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ports)).toEqual([]);
  });

  test('a widget the user lacks permission for is hidden', () => {
    const w = entry({ supportsPages: ['crm.*'] });
    const ports: WidgetGatingPorts = {
      gates: { isGateOn: () => true },
      permissions: { hasPermissions: () => false },
    };
    expect(eligibleWidgets([w], CUSTOMER_PAGE, ports)).toEqual([]);
  });

  test('the ports receive the widget identity, page id, and declared capabilities', () => {
    const capabilities: Capability[] = [{ api: 'records.read', scope: 'customer' }];
    const w = entry({ supportsPages: ['crm.*'], capabilities });
    const isGateOn = vi.fn(() => true);
    const hasPermissions = vi.fn(() => true);
    eligibleWidgets([w], CUSTOMER_PAGE, { gates: { isGateOn }, permissions: { hasPermissions } });
    const expectedQuery = { widget: w.id, pageTypeId: 'crm.customer-detail', capabilities };
    expect(isGateOn).toHaveBeenCalledWith(expectedQuery);
    expect(hasPermissions).toHaveBeenCalledWith(expectedQuery);
  });

  test('the ports are not consulted when an in-engine check already excludes the widget', () => {
    const w = entry({ supportsPages: ['dashboards.*'] });
    const isGateOn = vi.fn(() => true);
    const hasPermissions = vi.fn(() => true);
    expect(eligibleWidgets([w], CUSTOMER_PAGE, { gates: { isGateOn }, permissions: { hasPermissions } })).toEqual([]);
    expect(isGateOn).not.toHaveBeenCalled();
    expect(hasPermissions).not.toHaveBeenCalled();
  });
});

describe('absent-not-greyed — no capability leakage', () => {
  test('a gated-off widget leaves no entry, tag, name, or reason in the result', () => {
    const visible = entry({ tag: 'acme-public', supportsPages: ['crm.*'] });
    const secret = entry(
      { tag: 'acme-secret', name: 'Secret Admin Widget', supportsPages: ['crm.*'] },
      'registry.gridmason.dev',
    );
    const ports: WidgetGatingPorts = {
      gates: { isGateOn: (query) => query.widget.tag !== 'acme-secret' },
      permissions: { hasPermissions: () => true },
    };

    const result = eligibleWidgets([visible, secret], CUSTOMER_PAGE, ports);

    expect(result).toEqual([visible]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('acme-secret');
    expect(serialized).not.toContain('Secret Admin Widget');
  });
});
