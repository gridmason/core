import { beforeEach, describe, expect, test } from 'vitest';

import { ABI_ATTR } from './abi.js';
import type { WidgetMountInput } from './abi.js';
import { WidgetMountManager } from './mount-manager.js';

// A test widget that records its lifecycle transitions (with the SDK handle it
// sees at connect) into a shared log, so a test can assert both that a callback
// fired and the order relative to others.
const log: string[] = [];

class LifecycleWidget extends HTMLElement {
  connectedCallback(): void {
    const sdk = (this as unknown as { sdk?: unknown }).sdk;
    log.push(`connected:${this.getAttribute(ABI_ATTR.instanceId)}:${String(sdk ?? 'nosdk')}`);
  }
  disconnectedCallback(): void {
    log.push(`disconnected:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
}
customElements.define('mm-widget', LifecycleWidget);

// A widget that records only its instance id and never touches `.sdk` — used to
// prove core drives the whole mount→unmount lifecycle without inspecting the
// handle (the opaque-handle lock below mounts a handle that throws on access).
class OpaqueProbeWidget extends HTMLElement {
  connectedCallback(): void {
    log.push(`opaque-connected:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
  disconnectedCallback(): void {
    log.push(`opaque-disconnected:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
}
customElements.define('mm-opaque-widget', OpaqueProbeWidget);

let host: HTMLElement;
let manager: WidgetMountManager;

beforeEach(() => {
  // Clear the DOM first so any teardown from the previous test (which fires
  // disconnectedCallback) lands before we reset the shared log.
  document.body.innerHTML = '';
  log.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  manager = new WidgetMountManager();
});

function input(instanceId: string, overrides: Partial<WidgetMountInput> = {}): WidgetMountInput {
  return {
    tag: 'mm-widget',
    instanceId,
    sdk: undefined,
    context: null,
    settings: undefined,
    editMode: false,
    ...overrides,
  };
}

test('mount configures the ABI before connect: connectedCallback sees instance-id and the sdk handle', () => {
  manager.mount(host, input('w1', { sdk: 'SDK1' }));
  // The connect ran during append and already observed a fully-configured element.
  expect(log).toEqual(['connected:w1:SDK1']);
  const mounted = manager.get('w1');
  expect(mounted?.element.getAttribute(ABI_ATTR.instanceId)).toBe('w1');
  expect(host.contains(mounted!.element)).toBe(true);
});

test('mount tracks the widget and exposes it', () => {
  manager.mount(host, input('w1'));
  expect(manager.has('w1')).toBe(true);
  expect(manager.size).toBe(1);
  expect(manager.instanceIds).toEqual(['w1']);
  expect(manager.get('w1')?.tag).toBe('mm-widget');
});

test('a second mount of the same instance throws (must unmount or remount)', () => {
  manager.mount(host, input('w1'));
  expect(() => manager.mount(host, input('w1'))).toThrow(/already mounted/);
});

test('unmount removes the element from the DOM and fires disconnectedCallback', () => {
  const mounted = manager.mount(host, input('w1'));
  const returned = manager.unmount('w1');
  expect(returned).toBe(true);
  expect(log).toEqual(['connected:w1:nosdk', 'disconnected:w1']);
  expect(mounted.element.isConnected).toBe(false);
  expect(manager.has('w1')).toBe(false);
  expect(manager.size).toBe(0);
});

test('unmount of an unmounted instance is a no-op returning false', () => {
  expect(manager.unmount('nope')).toBe(false);
});

test('remount fires disconnectedCallback of the old element before the new one connects', () => {
  manager.mount(host, input('w1'));
  manager.remount(host, input('w1'));
  expect(log).toEqual(['connected:w1:nosdk', 'disconnected:w1', 'connected:w1:nosdk']);
  const disconnected = log.indexOf('disconnected:w1');
  const reconnected = log.lastIndexOf('connected:w1:nosdk');
  expect(disconnected).toBeLessThan(reconnected);
});

test('remount with no prior mount just mounts (no spurious disconnect)', () => {
  manager.remount(host, input('w1'));
  expect(log).toEqual(['connected:w1:nosdk']);
});

test('updateAbiState updates attributes in place without a re-mount', () => {
  manager.mount(host, input('w1', { context: { a: 1 }, editMode: false }));
  const el = manager.get('w1')!.element;
  const updated = manager.updateAbiState('w1', { context: { a: 2 }, settings: { s: 1 }, editMode: true });
  expect(updated).toBe(true);
  // No disconnect/reconnect happened — same element, updated attributes.
  expect(log).toEqual(['connected:w1:nosdk']);
  expect(el.getAttribute(ABI_ATTR.context)).toBe('{"a":2}');
  expect(el.getAttribute(ABI_ATTR.settings)).toBe('{"s":1}');
  expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(true);
});

test('updateAbiState on an unmounted instance returns false', () => {
  expect(manager.updateAbiState('nope', { context: null, settings: undefined, editMode: false })).toBe(false);
});

test('unmountAll disconnects every widget and clears the manager', () => {
  manager.mount(host, input('w1'));
  manager.mount(host, input('w2'));
  manager.unmountAll();
  expect(log).toEqual(['connected:w1:nosdk', 'connected:w2:nosdk', 'disconnected:w1', 'disconnected:w2']);
  expect(manager.size).toBe(0);
  expect(manager.instanceIds).toEqual([]);
});

test('unmountAll is safe to call again', () => {
  manager.mount(host, input('w1'));
  manager.unmountAll();
  expect(() => manager.unmountAll()).not.toThrow();
});

test('honors an injected ownerDocument for element creation', () => {
  const scoped = new WidgetMountManager({ ownerDocument: document });
  const mounted = scoped.mount(host, input('w1'));
  expect(mounted.element.ownerDocument).toBe(document);
});

// Locks the SDK handle-delivery contract at the mount seam (docs/canvas-abi.md,
// issue #52). If a later change moves when/whether `.sdk` is assigned relative to
// connect, or makes core read the handle, one of these must fail.
describe('SDK handle delivery contract (#52)', () => {
  test('the handle is readable synchronously in connectedCallback (assigned before connect)', () => {
    // mm-widget reads this.sdk during connectedCallback and logs it; the logged
    // handle proves `.sdk` was assigned before the element was inserted, not after.
    manager.mount(host, input('w1', { sdk: 'HANDLE' }));
    expect(log).toEqual(['connected:w1:HANDLE']);
  });

  test('a mount with no handle leaves `.sdk` as an own property set to undefined', () => {
    const el = manager.mount(host, input('w1')).element;
    expect(Object.hasOwn(el, 'sdk')).toBe(true);
    expect((el as unknown as { sdk?: unknown }).sdk).toBeUndefined();
  });

  test('core never inspects the handle across the full mount/update/unmount lifecycle', () => {
    // A handle that throws on any access; only mm-opaque-widget (which never reads
    // `.sdk`) is mounted, so any throw here means core touched the handle.
    const throwOnInspect = (): never => {
      throw new Error('the SDK handle must not be inspected by core');
    };
    const handle = new Proxy({}, { get: throwOnInspect, has: throwOnInspect });
    manager.mount(host, input('w1', { tag: 'mm-opaque-widget', sdk: handle }));
    expect(manager.updateAbiState('w1', { context: { a: 1 }, settings: undefined, editMode: true })).toBe(true);
    expect(manager.unmount('w1')).toBe(true);
    expect(log).toEqual(['opaque-connected:w1', 'opaque-disconnected:w1']);
  });
});
