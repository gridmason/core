import { beforeEach, expect, test } from 'vitest';

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
