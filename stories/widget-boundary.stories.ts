/**
 * Storybook stories for the per-widget error boundary + skeletons (#20, SPEC §7,
 * FR-10) — the crashing / slow / unavailable widget states, rendered through a
 * live `<gm-page-canvas>` (GW-D20 — no story, no merge).
 *
 * Like `page-canvas.stories.ts`, this is framework-agnostic CSF: the Storybook
 * toolchain is still stubbed (`.storybook/stub.mjs`), and the real config (C-E4)
 * renders these unchanged. Each story builds an in-memory `EffectiveLayout` of
 * deliberately misbehaving demo widgets so the boundary's fallback card,
 * skeleton, and telemetry attribution are all visible.
 */
import type { EffectiveLayout } from '../src/engine/layout/index.js';
import type { LayoutWidget } from '@gridmason/protocol';

import { PageCanvas } from '../src/canvas/PageCanvas/index.js';
import type { WidgetBoundaryEvent, WidgetInstanceIdentity } from '../src/canvas/boundary/index.js';

const OK_TAG = 'gm-demo-ok';
const SLOW_TAG = 'gm-demo-slow';
const CRASH_TAG = 'gm-demo-crash';
const MISSING_TAG = 'gm-demo-missing'; // deliberately never defined — a load failure.

/** A healthy widget: renders its instance id immediately (synchronous, no skeleton). */
class OkDemoWidget extends HTMLElement {
  connectedCallback(): void {
    this.style.cssText = paneStyle('#eef2ff', '#c7d2fe');
    this.innerHTML = `<strong>${this.getAttribute('instance-id') ?? '?'}</strong><div style="font-size:12px;opacity:.7">ready</div>`;
  }
}

/** A slow widget: declares itself pending (skeleton), then becomes interactive after a delay. */
class SlowDemoWidget extends HTMLElement {
  connectedCallback(): void {
    this.dispatchEvent(new CustomEvent('gm:loading', { bubbles: true }));
    setTimeout(() => {
      this.style.cssText = paneStyle('#ecfdf5', '#a7f3d0');
      this.innerHTML = `<strong>${this.getAttribute('instance-id') ?? '?'}</strong><div style="font-size:12px;opacity:.7">loaded after 1.5s</div>`;
      this.dispatchEvent(new CustomEvent('gm:ready', { bubbles: true }));
    }, 1500);
  }
}

/** A crashing widget: throws as it mounts, so the boundary shows its fallback card. */
class CrashDemoWidget extends HTMLElement {
  connectedCallback(): void {
    throw new Error('demo widget crashed on mount');
  }
}

function paneStyle(bg: string, border: string): string {
  return (
    'display:block;height:100%;box-sizing:border-box;padding:12px;border-radius:8px;' +
    `font-family:system-ui,sans-serif;background:${bg};border:1px solid ${border};`
  );
}

function ensureDefined(): void {
  if (customElements.get(OK_TAG) === undefined) customElements.define(OK_TAG, OkDemoWidget);
  if (customElements.get(SLOW_TAG) === undefined) customElements.define(SLOW_TAG, SlowDemoWidget);
  if (customElements.get(CRASH_TAG) === undefined) customElements.define(CRASH_TAG, CrashDemoWidget);
  PageCanvas.define();
}

function widget(i: string, tag: string, over: Partial<LayoutWidget> = {}): LayoutWidget {
  return { widgetID: { source: 'local', tag }, i, x: 0, y: 0, w: 4, h: 3, ...over };
}

function layout(items: LayoutWidget[]): EffectiveLayout {
  return {
    layout: { schemaVersion: 1, page: 'demo.page', name: 'Demo', default: true, grid: { items }, hasTabs: false, tabs: [] },
    lockedSlots: [],
  };
}

/** Friendly names for the entitled demo widgets; an unknown tag stays anonymous (SPEC §6/§8). */
const NAMES: Record<string, string> = {
  [OK_TAG]: 'Overview',
  [SLOW_TAG]: 'Live Feed',
  [CRASH_TAG]: 'Revenue Chart',
};

function buildCanvas(items: LayoutWidget[]): HTMLElement {
  ensureDefined();
  const canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
  canvas.context = { record: { recordType: 'customer', id: '42' } };
  canvas.telemetry = (event: WidgetBoundaryEvent) => console.log('[gm telemetry]', event);
  canvas.widgetDescriptor = ({ widgetID }: WidgetInstanceIdentity) => NAMES[widgetID.tag];
  canvas.latencyBudgetMs = 4000;
  canvas.layout = layout(items);
  return canvas;
}

const meta = {
  title: 'Canvas/WidgetBoundary',
  render: () =>
    buildCanvas([
      widget('overview', OK_TAG, { x: 0, w: 4 }),
      widget('feed', SLOW_TAG, { x: 4, w: 4 }),
      widget('revenue', CRASH_TAG, { x: 8, w: 4 }),
    ]),
};
export default meta;

/** A grid mixing a healthy, a slow (skeleton), and a crashing (fallback card) widget. */
export const Mixed = {};

/** A crashing widget renders a named fallback card with a retry, next to a healthy sibling. */
export const CrashingWidget = {
  render: () =>
    buildCanvas([widget('revenue', CRASH_TAG, { x: 0, w: 6 }), widget('overview', OK_TAG, { x: 6, w: 6 })]),
};

/** A slow widget shows a loading skeleton until it becomes interactive (1.5s). */
export const SlowWidget = {
  render: () => buildCanvas([widget('feed', SLOW_TAG, { x: 0, w: 6 })]),
};

/** An unresolved (never-defined) tag falls back to an anonymous "Unavailable widget" card. */
export const UnavailableWidget = {
  render: () => buildCanvas([widget('mystery', MISSING_TAG, { x: 0, w: 6 })]),
};
