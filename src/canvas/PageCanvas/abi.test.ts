import { beforeEach, describe, expect, test } from 'vitest';

import {
  ABI_ATTR,
  SDK_HANDLE_PROPERTY,
  applyAbiState,
  applyMountInput,
  assignSdkHandle,
  serializeContext,
  serializeSettings,
} from './abi.js';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
});

describe('serializeContext', () => {
  test('serializes a context value to JSON', () => {
    expect(serializeContext({ record: { recordType: 'customer', id: '42' } })).toBe(
      '{"record":{"recordType":"customer","id":"42"}}',
    );
  });

  test('maps a nullish context to "null" so the attribute is always valid JSON', () => {
    expect(serializeContext(undefined)).toBe('null');
    expect(serializeContext(null)).toBe('null');
  });

  test('degrades an unserializable context to "null" rather than throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(serializeContext(cyclic)).toBe('null');
  });
});

describe('serializeSettings', () => {
  test('serializes saved props to JSON', () => {
    expect(serializeSettings({ range: '30d', showLegend: true })).toBe('{"range":"30d","showLegend":true}');
  });

  test('maps absent props to an empty object', () => {
    expect(serializeSettings(undefined)).toBe('{}');
  });

  test('degrades unserializable props to "{}"', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(serializeSettings(cyclic)).toBe('{}');
  });
});

describe('applyAbiState', () => {
  test('sets context and settings and adds edit-mode when editing', () => {
    applyAbiState(el, { context: { a: 1 }, settings: { b: 2 }, editMode: true });
    expect(el.getAttribute(ABI_ATTR.context)).toBe('{"a":1}');
    expect(el.getAttribute(ABI_ATTR.settings)).toBe('{"b":2}');
    expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(true);
    expect(el.getAttribute(ABI_ATTR.editMode)).toBe('');
  });

  test('removes edit-mode when not editing', () => {
    el.setAttribute(ABI_ATTR.editMode, '');
    applyAbiState(el, { context: null, settings: undefined, editMode: false });
    expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(false);
  });
});

describe('applyMountInput', () => {
  test('sets instance-id, the opaque sdk property, and the mutable ABI state', () => {
    const sdk = { bus: 'handle' };
    applyMountInput(el, {
      tag: 'acme-chart',
      instanceId: 'w1',
      sdk,
      context: { t: 1 },
      settings: { s: 1 },
      editMode: false,
    });
    expect(el.getAttribute(ABI_ATTR.instanceId)).toBe('w1');
    expect((el as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY]).toBe(sdk);
    expect(el.getAttribute(ABI_ATTR.context)).toBe('{"t":1}');
    expect(el.getAttribute(ABI_ATTR.settings)).toBe('{"s":1}');
    expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(false);
  });
});

describe('assignSdkHandle', () => {
  test('stores the handle verbatim under the ABI property', () => {
    const handle = Symbol('sdk');
    assignSdkHandle(el, handle);
    expect((el as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY]).toBe(handle);
  });

  test('accepts undefined (no handle supplied)', () => {
    assignSdkHandle(el, undefined);
    expect((el as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY]).toBeUndefined();
  });
});

// Locks the host→widget SDK handle-delivery contract pinned in docs/canvas-abi.md
// (issue #52). These are the ABI-function-level guarantees @gridmason/cli's
// widget templates and host shells depend on; a change here is a breaking ABI
// change and must fail these first.
describe('SDK handle delivery contract (#52)', () => {
  test('the handle property name is pinned to "sdk"', () => {
    expect(SDK_HANDLE_PROPERTY).toBe('sdk');
  });

  test('an unset handle is delivered as an own property set to undefined', () => {
    applyMountInput(el, {
      tag: 'acme-chart',
      instanceId: 'w1',
      sdk: undefined,
      context: null,
      settings: undefined,
      editMode: false,
    });
    // Not merely absent: the property exists (own) with value undefined, so a
    // widget reading this.sdk gets undefined rather than a prototype lookup.
    expect(Object.hasOwn(el, SDK_HANDLE_PROPERTY)).toBe(true);
    expect((el as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY]).toBeUndefined();
  });

  test('the handle is stored verbatim and never inspected (opaque)', () => {
    // A handle that throws on ANY property access still round-trips: the ABI
    // assigns and reads it back by reference only. Locks "core never inspects it".
    const throwOnInspect = (): never => {
      throw new Error('the SDK handle must not be inspected by core');
    };
    const handle = new Proxy(
      {},
      { get: throwOnInspect, has: throwOnInspect, ownKeys: throwOnInspect },
    );
    expect(() => assignSdkHandle(el, handle)).not.toThrow();
    expect(() =>
      applyMountInput(el, {
        tag: 'acme-chart',
        instanceId: 'w1',
        sdk: handle,
        context: null,
        settings: undefined,
        editMode: false,
      }),
    ).not.toThrow();
    // Reference identity, not a property read — does not trip the proxy traps.
    expect((el as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY]).toBe(handle);
  });
});
