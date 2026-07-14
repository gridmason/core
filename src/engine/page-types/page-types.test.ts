import { describe, expect, test } from 'vitest';

import type { PageTypeInput } from './index.js';
import { PageTypeRegistry, PageTypeRegistrationError } from './index.js';

// The `crm.customer-detail` descriptor from docs/SPEC.md §3, expressed in the
// protocol contract (locks are slot ids; the full typed context grammar is
// retained for gating). Acceptance criterion 1.
const customerDetail: PageTypeInput = {
  id: 'crm.customer-detail',
  context: { record: { type: 'record-ref', recordType: 'customer' } },
  default_layout: 'layouts/customer-detail.json',
  locks: ['header-summary'],
  allow_user_customization: true,
};

describe('PageTypeRegistry — registration', () => {
  test('registers the SPEC §3 crm.customer-detail descriptor', () => {
    const registry = new PageTypeRegistry();
    const registered = registry.register(customerDetail);

    expect(registered.id).toBe('crm.customer-detail');
    expect(registered.context).toEqual({ record: { type: 'record-ref', recordType: 'customer' } });
    expect(registered.default_layout).toBe('layouts/customer-detail.json');
    expect(registered.locks).toEqual(['header-summary']);
    expect(registered.allow_user_customization).toBe(true);
    expect(registry.get('crm.customer-detail')).toBe(registered);
    expect(registry.has('crm.customer-detail')).toBe(true);
  });

  test('registers a page type that omits the optional fields, defaulting to a locked page', () => {
    const registry = new PageTypeRegistry();
    const registered = registry.register({
      id: 'ops.blank',
      context: {},
    });

    // allow_user_customization defaults to false (customization is opt-in);
    // locks defaults to an empty list; optional fields are absent, not undefined.
    expect(registered.allow_user_customization).toBe(false);
    expect(registered.locks).toEqual([]);
    expect('default_layout' in registered).toBe(false);
    expect('pages' in registered).toBe(false);
  });

  test('rejects a duplicate id', () => {
    const registry = new PageTypeRegistry();
    registry.register(customerDetail);
    expect(() => registry.register(customerDetail)).toThrow(PageTypeRegistrationError);
    expect(() => registry.register(customerDetail)).toThrow(/already registered/);
  });

  test('rejects a missing or empty id', () => {
    const registry = new PageTypeRegistry();
    expect(() => registry.register({ id: '', context: {} })).toThrow(/non-empty string id/);
    expect(() =>
      registry.register({ id: 123 as unknown as string, context: {} }),
    ).toThrow(PageTypeRegistrationError);
  });

  test('rejects a non-object context map', () => {
    const registry = new PageTypeRegistry();
    expect(() =>
      registry.register({ id: 'x', context: 'nope' as unknown as PageTypeInput['context'] }),
    ).toThrow(/must declare a 'context' map/);
  });
});

describe('PageTypeRegistry — typed context validation (registration-time errors)', () => {
  const registry = new PageTypeRegistry();
  let seq = 0;
  const registerContext = (context: unknown): void => {
    registry.register({ id: `ctx.case-${seq++}`, context: context as PageTypeInput['context'] });
  };

  test('accepts every primitive context type', () => {
    expect(() =>
      registerContext({
        r: { type: 'record-ref', recordType: 'customer' },
        s: { type: 'string' },
        n: { type: 'number' },
        b: { type: 'bool' },
        i: { type: 'id' },
      }),
    ).not.toThrow();
  });

  test('accepts list and object composites, including nesting', () => {
    expect(() =>
      registerContext({
        rows: {
          type: 'list',
          element: { type: 'object', fields: { id: { type: 'id' }, owner: { type: 'record-ref', recordType: 'customer' } } },
        },
      }),
    ).not.toThrow();
  });

  test('rejects an unknown context type at registration time', () => {
    expect(() => registerContext({ record: { type: 'nonsense' } })).toThrow(/unknown type "nonsense"/);
  });

  test('rejects a context slot that is not a context-type object', () => {
    expect(() => registerContext({ record: 'customer' })).toThrow(/must be a context-type object/);
    expect(() => registerContext({ record: null })).toThrow(/must be a context-type object/);
    expect(() => registerContext({ record: [] })).toThrow(/must be a context-type object/);
  });

  test('rejects a record-ref missing a non-empty recordType', () => {
    expect(() => registerContext({ record: { type: 'record-ref' } })).toThrow(/non-empty 'recordType'/);
    expect(() => registerContext({ record: { type: 'record-ref', recordType: '' } })).toThrow(/non-empty 'recordType'/);
    expect(() => registerContext({ record: { type: 'record-ref', recordType: 42 } })).toThrow(/non-empty 'recordType'/);
  });

  test('rejects a list without an element type', () => {
    expect(() => registerContext({ rows: { type: 'list' } })).toThrow(/requires an 'element' type/);
  });

  test('reports the path of a malformed nested list element', () => {
    expect(() => registerContext({ rows: { type: 'list', element: { type: 'bogus' } } })).toThrow(
      /context 'rows.element' has unknown type/,
    );
  });

  test('rejects an object without a fields map', () => {
    expect(() => registerContext({ filter: { type: 'object' } })).toThrow(/requires a 'fields' map/);
  });

  test('reports the path of a malformed object field', () => {
    expect(() =>
      registerContext({ filter: { type: 'object', fields: { owner: { type: 'bogus' } } } }),
    ).toThrow(/context 'filter.owner' has unknown type/);
  });
});

describe('PageTypeRegistry — locks and customization (acceptance criterion 3)', () => {
  test('allow_user_customization: false yields a locked page that retains its slot locks', () => {
    const registry = new PageTypeRegistry();
    const registered = registry.register({
      id: 'crm.locked-detail',
      context: { record: { type: 'record-ref', recordType: 'customer' } },
      locks: ['header-summary', 'footer-actions'],
      allow_user_customization: false,
    });

    expect(registered.allow_user_customization).toBe(false);
    expect(registered.locks).toEqual(['header-summary', 'footer-actions']);
  });

  test('rejects a malformed locks list', () => {
    const registry = new PageTypeRegistry();
    const base = { id: 'x', context: {} };
    expect(() =>
      registry.register({ ...base, locks: 'header' as unknown as string[] }),
    ).toThrow(/'locks' must be an array of strings/);
    expect(() => registry.register({ ...base, locks: [42 as unknown as string] })).toThrow(
      /'locks' must contain only non-empty strings/,
    );
    expect(() => registry.register({ ...base, locks: [''] })).toThrow(/only non-empty strings/);
  });

  test('rejects a non-string default_layout and a non-boolean allow_user_customization', () => {
    const registry = new PageTypeRegistry();
    expect(() =>
      registry.register({ id: 'x', context: {}, default_layout: 7 as unknown as string }),
    ).toThrow(/'default_layout' must be a string/);
    expect(() =>
      registry.register({ id: 'y', context: {}, allow_user_customization: 'yes' as unknown as boolean }),
    ).toThrow(/'allow_user_customization' must be a boolean/);
  });
});

describe('PageTypeRegistry — regex escape hatch (migration-only)', () => {
  test('retains legacy POC route-regex pages verbatim without compiling them', () => {
    const registry = new PageTypeRegistry();
    const registered = registry.register({
      id: 'legacy.catch-all',
      context: {},
      pages: ['.*', 'customers/.*'],
    });

    // The engine stores the patterns for migration; matching (and its safe
    // matcher, never `new RegExp(userInput)`) is the picker/gating layer's job.
    expect(registered.pages).toEqual(['.*', 'customers/.*']);
  });

  test('rejects a malformed pages list', () => {
    const registry = new PageTypeRegistry();
    expect(() =>
      registry.register({ id: 'x', context: {}, pages: [42 as unknown as string] }),
    ).toThrow(/'pages' must contain only non-empty strings/);
  });
});

describe('PageTypeRegistry — lookup', () => {
  test('get returns undefined and has returns false for an unknown id', () => {
    const registry = new PageTypeRegistry();
    expect(registry.get('nope')).toBeUndefined();
    expect(registry.has('nope')).toBe(false);
  });

  test('list returns all registered page types in registration order', () => {
    const registry = new PageTypeRegistry();
    expect(registry.list()).toEqual([]);
    const a = registry.register({ id: 'a', context: {} });
    const b = registry.register({ id: 'b', context: {} });
    expect(registry.list()).toEqual([a, b]);
  });
});
