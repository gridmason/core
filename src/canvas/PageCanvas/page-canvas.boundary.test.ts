import { beforeEach, expect, test } from 'vitest';

import type { EffectiveLayout } from '../../engine/layout/index.js';
import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';
import { BOUNDARY_CLASS } from '../boundary/index.js';
import type { WidgetBoundaryEvent } from '../boundary/index.js';

import { PageCanvas } from './page-canvas.js';

// The error boundary (#20) wired through the real PageCanvas + gridstack: a
// crashing widget must fall back without touching its siblings, telemetry must
// reach the canvas's `telemetry` port with the instance identity, and a gated-off
// instance (already omitted from the EffectiveLayout by the engine, C-E2) must
// never surface a card.

class OkWidget extends HTMLElement {
  connectedCallback(): void {
    this.textContent = 'ok';
  }
}
class ThrowWidget extends HTMLElement {
  connectedCallback(): void {
    throw new Error('render-boom');
  }
}
customElements.define('pcb-ok', OkWidget);
customElements.define('pcb-throw', ThrowWidget);
PageCanvas.define();

function widget(i: string, tag: string, over: Partial<LayoutWidget> = {}): LayoutWidget {
  return { widgetID: { source: 'local', tag }, i, x: 0, y: 0, w: 4, h: 3, ...over };
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
let events: WidgetBoundaryEvent[];
beforeEach(() => {
  document.body.innerHTML = '';
  events = [];
  canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
});

test('a crashing widget renders a fallback card while its sibling mounts unaffected', () => {
  canvas.telemetry = (e) => events.push(e);
  canvas.widgetDescriptor = ({ widgetID }) => (widgetID.tag === 'pcb-throw' ? 'Revenue Widget' : undefined);
  canvas.layout = singleGrid([widget('bad', 'pcb-throw'), widget('good', 'pcb-ok', { x: 4 })]);
  document.body.appendChild(canvas);

  // The healthy sibling mounted and is interactive.
  expect(canvas.widgetElement('good')?.textContent).toBe('ok');
  expect(canvas.boundaryOf('good')?.state).toBe('ready');

  // The crashing widget fell back to a named card with a retry.
  expect(canvas.boundaryOf('bad')?.state).toBe('error');
  const card = canvas.boundaryOf('bad')!.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)!;
  expect(card.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)?.textContent).toBe('Revenue Widget');
  expect(card.querySelector(`.${BOUNDARY_CLASS.retry}`)).not.toBeNull();

  // Telemetry reached the canvas port with the instance identity.
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'widget.error',
      reason: 'threw',
      instanceId: 'bad',
      widgetID: { source: 'local', tag: 'pcb-throw' },
    }),
  );
});

test('a gated-off instance (absent from the effective layout) produces no card', () => {
  canvas.telemetry = (e) => events.push(e);
  // The engine's resolution-time gating (C-E2) has already omitted the gated-off
  // widget, so the canvas only ever sees the entitled one. There must be no
  // boundary, no card, and no telemetry for the omitted instance (SPEC §6).
  canvas.layout = singleGrid([widget('shown', 'pcb-ok')]);
  document.body.appendChild(canvas);

  expect(canvas.mountedInstanceIds).toEqual(['shown']);
  expect(canvas.boundaryOf('gated')).toBeUndefined();
  expect(document.body.querySelectorAll(`.${BOUNDARY_CLASS.fallback}`).length).toBe(0);
  expect(events.filter((e) => e.type === 'widget.error')).toEqual([]);
});

test('telemetry set after render applies to the next mount', () => {
  canvas.layout = singleGrid([widget('good', 'pcb-ok')]);
  document.body.appendChild(canvas);
  canvas.telemetry = (e) => events.push(e);

  // Re-render with a crashing widget; the late-set telemetry port receives it.
  canvas.layout = singleGrid([widget('bad', 'pcb-throw')]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'widget.error', instanceId: 'bad' }));
});

test('the boundaryAnnounce sink speaks a widget failure through the canvas (issue #55)', () => {
  const spoken: string[] = [];
  canvas.boundaryAnnounce = (m) => spoken.push(m);
  canvas.widgetDescriptor = ({ widgetID }) => (widgetID.tag === 'pcb-throw' ? 'Revenue Widget' : undefined);
  canvas.layout = singleGrid([widget('bad', 'pcb-throw'), widget('good', 'pcb-ok', { x: 4 })]);
  document.body.appendChild(canvas);

  // The failure is announced by name; the healthy sibling is silent (no chatter).
  expect(spoken).toEqual(['Revenue Widget is unavailable.']);
});
