import { beforeEach, describe, expect, test } from 'vitest';

import type { EffectiveLayout } from '../../engine/layout/index.js';
import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';

import { ABI_ATTR } from './abi.js';
import { PageCanvas } from './page-canvas.js';

// Two test widgets recording their lifecycle (tag + instance id + sdk seen at
// connect) into a shared ordered log, so a test can assert order across a
// layout change / tab switch / identity change.
const log: string[] = [];
class WidgetBase extends HTMLElement {
  connectedCallback(): void {
    const sdk = (this as unknown as { sdk?: unknown }).sdk;
    log.push(`connected:${this.localName}:${this.getAttribute(ABI_ATTR.instanceId)}:${String(sdk ?? 'nosdk')}`);
  }
  disconnectedCallback(): void {
    log.push(`disconnected:${this.localName}:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
}
class WidgetA extends WidgetBase {}
class WidgetB extends WidgetBase {}
customElements.define('pc-widget', WidgetA);
customElements.define('pc-widget-b', WidgetB);
PageCanvas.define();

function widget(i: string, geo: Partial<LayoutWidget> = {}): LayoutWidget {
  return {
    widgetID: { source: 'local', tag: 'pc-widget' },
    i,
    x: 0,
    y: 0,
    w: 4,
    h: 3,
    ...geo,
  };
}

function singleGrid(items: LayoutWidget[], lockedSlots: string[] = []): EffectiveLayout {
  const layout: LayoutPage = {
    schemaVersion: 1,
    page: 'demo.page',
    name: 'Demo',
    default: true,
    grid: { items },
    hasTabs: false,
    tabs: [],
  };
  return { layout, lockedSlots };
}

function tabbedGrid(tabs: { name: string; items: LayoutWidget[] }[]): EffectiveLayout {
  const layout: LayoutPage = {
    schemaVersion: 1,
    page: 'demo.page',
    name: 'Demo',
    default: true,
    grid: { items: [] },
    hasTabs: true,
    tabs: tabs.map((t) => ({ name: t.name, grid: { items: t.items } })),
  };
  return { layout, lockedSlots: [] };
}

let canvas: PageCanvas;
beforeEach(() => {
  // Clear the DOM first so a previous canvas's teardown (disconnectedCallback)
  // lands before we reset the shared log.
  document.body.innerHTML = '';
  log.length = 0;
  canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
});

/** Mount the canvas into the document (fires connectedCallback → grid init + render). */
function connect(): void {
  document.body.appendChild(canvas);
}

test('define registers <gm-page-canvas> and is idempotent', () => {
  expect(customElements.get(PageCanvas.tagName)).toBe(PageCanvas);
  expect(() => PageCanvas.define()).not.toThrow();
});

test('mounts a widget from an EffectiveLayout with the four ABI attrs and the sdk handle', () => {
  const sdk = { bus: 'x' };
  canvas.context = { record: { recordType: 'customer', id: '42' } };
  canvas.sdk = sdk;
  canvas.layout = singleGrid([widget('w1', { props: { range: '30d' } })]);
  connect();

  const el = canvas.widgetElement('w1');
  expect(el).toBeDefined();
  expect(el!.localName).toBe('pc-widget');
  expect(el!.getAttribute(ABI_ATTR.instanceId)).toBe('w1');
  expect(el!.getAttribute(ABI_ATTR.context)).toBe('{"record":{"recordType":"customer","id":"42"}}');
  expect(el!.getAttribute(ABI_ATTR.settings)).toBe('{"range":"30d"}');
  expect(el!.hasAttribute(ABI_ATTR.editMode)).toBe(false);
  expect((el as unknown as { sdk?: unknown }).sdk).toBe(sdk);
  // The sdk handle was present when connectedCallback ran.
  expect(log).toEqual(['connected:pc-widget:w1:[object Object]']);
});

test('renders multiple items and reports mounted instance ids', () => {
  canvas.layout = singleGrid([widget('w1'), widget('w2', { x: 4 }), widget('w3', { x: 8 })]);
  connect();
  expect(canvas.mountedInstanceIds).toEqual(['w1', 'w2', 'w3']);
});

test('grid geometry {x,y,w,h,i} round-trips through gridstack', () => {
  canvas.layout = singleGrid([widget('w1', { x: 1, y: 2, w: 4, h: 3 })]);
  connect();
  expect(canvas.geometryOf('w1')).toEqual({ x: 1, y: 2, w: 4, h: 3, i: 'w1' });
});

test('geometryOf is undefined for an unmounted instance', () => {
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  expect(canvas.geometryOf('nope')).toBeUndefined();
});

test('a layout change unmounts departing widgets before mounting arrivals (disconnect precedes connect)', () => {
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  log.length = 0;

  canvas.layout = singleGrid([widget('w2', { x: 4 })]);

  expect(canvas.mountedInstanceIds).toEqual(['w2']);
  expect(log).toEqual(['disconnected:pc-widget:w1', 'connected:pc-widget:w2:nosdk']);
  const disconnected = log.indexOf('disconnected:pc-widget:w1');
  const connected = log.indexOf('connected:pc-widget:w2:nosdk');
  expect(disconnected).toBeLessThan(connected);
});

test('a tab switch fires the old tab disconnect before the new tab connect', () => {
  canvas.layout = tabbedGrid([
    { name: 'Overview', items: [widget('w1')] },
    { name: 'Details', items: [widget('w2', { widgetID: { source: 'local', tag: 'pc-widget' } })] },
  ]);
  connect();
  expect(canvas.mountedInstanceIds).toEqual(['w1']);
  log.length = 0;

  canvas.activeTab = 1;

  expect(canvas.mountedInstanceIds).toEqual(['w2']);
  expect(log).toEqual(['disconnected:pc-widget:w1', 'connected:pc-widget:w2:nosdk']);
});

test('an out-of-range active tab renders an empty grid', () => {
  canvas.layout = tabbedGrid([{ name: 'Only', items: [widget('w1')] }]);
  connect();
  canvas.activeTab = 5;
  expect(canvas.mountedInstanceIds).toEqual([]);
});

test('an identity (tag) change on the same instance re-mounts a fresh element', () => {
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  log.length = 0;

  canvas.layout = singleGrid([widget('w1', { widgetID: { source: 'local', tag: 'pc-widget-b' } })]);

  // old element disconnects before the new-tag element connects.
  expect(log).toEqual(['disconnected:pc-widget:w1', 'connected:pc-widget-b:w1:nosdk']);
  expect(canvas.widgetElement('w1')?.localName).toBe('pc-widget-b');
});

test('a persisting widget is updated in place, not re-mounted, on a geometry change', () => {
  canvas.layout = singleGrid([widget('w1', { x: 0 })]);
  connect();
  const el = canvas.widgetElement('w1');
  log.length = 0;

  canvas.layout = singleGrid([widget('w1', { x: 2, y: 1, w: 6 })]);

  // No disconnect/connect — same element instance, new geometry.
  expect(log).toEqual([]);
  expect(canvas.widgetElement('w1')).toBe(el);
  expect(canvas.geometryOf('w1')).toEqual({ x: 2, y: 1, w: 6, h: 3, i: 'w1' });
});

test('toggling editMode reflects the edit-mode attribute in place without a re-mount', () => {
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  const el = canvas.widgetElement('w1')!;
  log.length = 0;

  canvas.editMode = true;
  expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(true);
  canvas.editMode = false;
  expect(el.hasAttribute(ABI_ATTR.editMode)).toBe(false);
  // No re-mount happened.
  expect(log).toEqual([]);
});

test('changing context updates every mounted widget in place', () => {
  canvas.context = { a: 1 };
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  const el = canvas.widgetElement('w1')!;
  expect(el.getAttribute(ABI_ATTR.context)).toBe('{"a":1}');
  log.length = 0;

  canvas.context = { a: 2 };
  expect(el.getAttribute(ABI_ATTR.context)).toBe('{"a":2}');
  expect(log).toEqual([]);
});

// Locks the host→widget SDK handle-delivery contract at the canvas seam
// (docs/canvas-abi.md, issue #52) — the `.sdk` property, before-connect timing,
// in-place re-assignment, and the single shared handle of 0.3.x.
describe('SDK handle delivery contract (#52)', () => {
  test('setting sdk re-assigns the opaque handle on already-mounted widgets in place', () => {
    canvas.sdk = { first: true };
    canvas.layout = singleGrid([widget('w1')]);
    connect();
    const el = canvas.widgetElement('w1')!;
    log.length = 0;

    const handle = { second: true };
    canvas.sdk = handle;

    expect((el as unknown as { sdk?: unknown }).sdk).toBe(handle);
    // In place: no re-mount (no disconnect/reconnect) and the widget is not
    // signalled — the same element carries the new handle.
    expect(log).toEqual([]);
    expect(canvas.widgetElement('w1')).toBe(el);
  });

  test('one shared handle reaches every mounted widget by the same reference (0.3.x)', () => {
    const handle = { shared: true };
    canvas.sdk = handle;
    canvas.layout = singleGrid([widget('w1'), widget('w2', { x: 4 })]);
    connect();

    const a = canvas.widgetElement('w1') as unknown as { sdk?: unknown };
    const b = canvas.widgetElement('w2') as unknown as { sdk?: unknown };
    expect(a.sdk).toBe(handle);
    expect(b.sdk).toBe(handle);
    expect(a.sdk).toBe(b.sdk);
  });

  test('an unset canvas sdk still delivers `.sdk` to a widget as undefined', () => {
    canvas.layout = singleGrid([widget('w1')]);
    connect();
    const el = canvas.widgetElement('w1')!;
    expect(Object.hasOwn(el, 'sdk')).toBe(true);
    expect((el as unknown as { sdk?: unknown }).sdk).toBeUndefined();
  });
});

test('a locked slot renders its item locked and non-movable', () => {
  canvas.layout = singleGrid([widget('w1', { slot: 'header', x: 0 })], ['header']);
  connect();
  const el = canvas.widgetElement('w1')!;
  const item = el.closest('.grid-stack-item') as unknown as { gridstackNode?: { locked?: boolean; noMove?: boolean } };
  expect(item.gridstackNode?.locked).toBe(true);
  expect(item.gridstackNode?.noMove).toBe(true);
});

test('disconnecting the canvas tears down every widget (fires disconnectedCallback)', () => {
  canvas.layout = singleGrid([widget('w1'), widget('w2', { x: 4 })]);
  connect();
  log.length = 0;

  canvas.remove();

  expect(log).toContain('disconnected:pc-widget:w1');
  expect(log).toContain('disconnected:pc-widget:w2');
  expect(canvas.mountedInstanceIds).toEqual([]);
});

test('re-connecting after removal re-initializes the grid and re-mounts', () => {
  canvas.layout = singleGrid([widget('w1')]);
  connect();
  canvas.remove();
  log.length = 0;

  document.body.appendChild(canvas);
  expect(canvas.mountedInstanceIds).toEqual(['w1']);
  expect(log).toEqual(['connected:pc-widget:w1:nosdk']);
});

test('renders nothing until connected, then renders on connect', () => {
  canvas.layout = singleGrid([widget('w1')]);
  expect(canvas.mountedInstanceIds).toEqual([]);
  connect();
  expect(canvas.mountedInstanceIds).toEqual(['w1']);
});
