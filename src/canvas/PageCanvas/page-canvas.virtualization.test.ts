import { beforeEach, expect, test } from 'vitest';

import type { EffectiveLayout } from '../../engine/layout/index.js';
import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';
import type { CanvasInteractiveEvent } from '../perf/index.js';
import type { VirtualizerObserverEntry, VirtualizerObserverFactory } from '../virtualization/index.js';

import { ABI_ATTR } from './abi.js';
import { PageCanvas } from './page-canvas.js';

// Widgets recording connect/disconnect so a test can prove a virtualized widget
// is mounted only while on screen and torn down (its disconnectedCallback fires)
// when it scrolls away.
const log: string[] = [];
class VWidget extends HTMLElement {
  connectedCallback(): void {
    log.push(`connected:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
  disconnectedCallback(): void {
    log.push(`disconnected:${this.getAttribute(ABI_ATTR.instanceId)}`);
  }
}
if (customElements.get('pcv-widget') === undefined) customElements.define('pcv-widget', VWidget);
PageCanvas.define();

// A hand-driven IntersectionObserver factory: it collects the targets the canvas
// observes and lets the test flip their intersection state on demand.
class FakeObserverHub {
  #callback: (entries: readonly VirtualizerObserverEntry[]) => void = () => {};
  readonly targets = new Set<Element>();
  readonly factory: VirtualizerObserverFactory = (cb) => {
    this.#callback = cb;
    return {
      observe: (t) => this.targets.add(t),
      unobserve: (t) => this.targets.delete(t),
      disconnect: () => this.targets.clear(),
    };
  };
  enter(...targets: Element[]): void {
    this.#callback(targets.map((target) => ({ target, isIntersecting: true })));
  }
  leave(...targets: Element[]): void {
    this.#callback(targets.map((target) => ({ target, isIntersecting: false })));
  }
}

function widget(i: string, geo: Partial<LayoutWidget> = {}): LayoutWidget {
  return { widgetID: { source: 'local', tag: 'pcv-widget' }, i, x: 0, y: 0, w: 4, h: 3, ...geo };
}

function singleGrid(items: LayoutWidget[]): EffectiveLayout {
  const layout: LayoutPage = {
    schemaVersion: 1,
    page: 'demo.page',
    name: 'Demo',
    default: true,
    grid: { items },
    hasTabs: false,
    tabs: [],
  };
  return { layout, lockedSlots: [] };
}

let canvas: PageCanvas;
let hub: FakeObserverHub;

beforeEach(() => {
  document.body.innerHTML = '';
  log.length = 0;
  hub = new FakeObserverHub();
  canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
});

/** The grid-item element (`.grid-stack-item` with our id) for an instance, so the test can drive its intersection. */
function itemEl(i: string): Element {
  const el = canvas.querySelector(`.grid-stack-item[gs-id="${i}"]`);
  if (el === null) throw new Error(`no grid item for ${i}`);
  return el;
}

test('virtualized: offscreen widgets are placed but not mounted until near the viewport', () => {
  canvas.virtualize = true;
  canvas.virtualizeObserverFactory = hub.factory;
  canvas.layout = singleGrid([widget('a'), widget('b', { y: 100 }), widget('c', { y: 200 })]);
  document.body.appendChild(canvas);

  // All three grid items are placed (geometry is correct), but none mounted yet.
  expect(canvas.geometryOf('a')).toMatchObject({ i: 'a' });
  expect(canvas.geometryOf('c')).toMatchObject({ y: 200 });
  expect(canvas.mountedInstanceIds).toEqual([]);
  expect(log).toEqual([]);

  // Only 'a' is near the viewport → only 'a' mounts.
  hub.enter(itemEl('a'));
  expect(canvas.mountedInstanceIds).toEqual(['a']);
  expect(log).toEqual(['connected:a']);
  expect(canvas.mountedInstanceIds.length).toBeLessThan(3); // mount count << total
});

test('virtualized: a widget leaving the viewport is unmounted (disconnectedCallback fires)', () => {
  canvas.virtualize = true;
  canvas.virtualizeObserverFactory = hub.factory;
  canvas.layout = singleGrid([widget('a'), widget('b', { y: 100 })]);
  document.body.appendChild(canvas);

  hub.enter(itemEl('a'), itemEl('b'));
  expect([...canvas.mountedInstanceIds].sort()).toEqual(['a', 'b']);
  log.length = 0;

  hub.leave(itemEl('a'));
  expect(log).toEqual(['disconnected:a']); // torn down on exit
  expect(canvas.mountedInstanceIds).toEqual(['b']);
  // The grid item survives so geometry/height are unaffected while offscreen.
  expect(canvas.geometryOf('a')).toMatchObject({ i: 'a' });
});

test('non-virtualized (default): every widget mounts eagerly', () => {
  canvas.layout = singleGrid([widget('a'), widget('b'), widget('c')]);
  document.body.appendChild(canvas);
  expect([...canvas.mountedInstanceIds].sort()).toEqual(['a', 'b', 'c']);
});

test('toggling virtualize on after render tears widgets down to the offscreen baseline', () => {
  canvas.virtualizeObserverFactory = hub.factory;
  canvas.layout = singleGrid([widget('a'), widget('b')]);
  document.body.appendChild(canvas);
  expect([...canvas.mountedInstanceIds].sort()).toEqual(['a', 'b']); // eager

  canvas.virtualize = true; // re-applies the policy: unmount all, wait for intersection
  expect(canvas.mountedInstanceIds).toEqual([]);
  hub.enter(itemEl('a'));
  expect(canvas.mountedInstanceIds).toEqual(['a']);
});

test('perf marks: a data→interactive render emits a canvas.interactive telemetry event', () => {
  const events: CanvasInteractiveEvent[] = [];
  canvas.perfTelemetry = (e) => events.push(e);
  document.body.appendChild(canvas); // connect first (no layout yet)
  canvas.layout = singleGrid([widget('a'), widget('b')]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'canvas.interactive',
    placedCount: 2,
    mountedCount: 2,
    virtualized: false,
  });
  expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
});

test('perf marks: layout assigned before connect is measured once, across the connect boundary', () => {
  const events: CanvasInteractiveEvent[] = [];
  canvas.perfTelemetry = (e) => events.push(e);
  canvas.layout = singleGrid([widget('a')]); // data before connect — window opens, render no-ops
  expect(events).toEqual([]); // not settled until the grid exists
  document.body.appendChild(canvas); // connect → grid init → render → settle
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ placedCount: 1, mountedCount: 1 });
});

test('perf marks: the mounted count reflects virtualization (placed >> mounted)', () => {
  const events: CanvasInteractiveEvent[] = [];
  canvas.perfTelemetry = (e) => events.push(e);
  canvas.virtualize = true;
  canvas.virtualizeObserverFactory = hub.factory;
  document.body.appendChild(canvas);
  canvas.layout = singleGrid([widget('a'), widget('b'), widget('c'), widget('d')]);

  const last = events.at(-1)!;
  expect(last.placedCount).toBe(4);
  expect(last.mountedCount).toBe(0); // nothing intersecting yet at settle time
  expect(last.virtualized).toBe(true);
});

test('virtualized teardown on disconnect unmounts the on-screen widgets', () => {
  canvas.virtualize = true;
  canvas.virtualizeObserverFactory = hub.factory;
  canvas.layout = singleGrid([widget('a')]);
  document.body.appendChild(canvas);
  hub.enter(itemEl('a'));
  expect(log).toEqual(['connected:a']);

  canvas.remove(); // disconnectedCallback → teardown
  expect(log).toEqual(['connected:a', 'disconnected:a']);
});
