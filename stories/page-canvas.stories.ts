/**
 * Storybook story for {@link PageCanvas} (GW-D20 — no story, no merge).
 *
 * The full Storybook toolchain is an advisory pre-1.0 harness and is still
 * stubbed (see `.storybook/stub.mjs`); this file is the first real component
 * story, framework-agnostic CSF that builds a live `<gm-page-canvas>` and mounts
 * a small demo widget from an in-memory `EffectiveLayout`. When the real
 * Storybook config lands (C-E3/C-E4), it renders these stories unchanged.
 */
import type { EffectiveLayout } from '../src/engine/layout/index.js';
import type { LayoutWidget } from '@gridmason/protocol';

import { PageCanvas } from '../src/canvas/PageCanvas/index.js';

const DEMO_TAG = 'gm-demo-widget';

/** A tiny self-describing demo widget: renders its instance id and its serialized settings. */
class DemoWidget extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['settings', 'edit-mode'];
  }
  connectedCallback(): void {
    this.#render();
  }
  attributeChangedCallback(): void {
    this.#render();
  }
  #render(): void {
    const editing = this.hasAttribute('edit-mode');
    this.style.cssText =
      'display:block;height:100%;box-sizing:border-box;padding:12px;border-radius:8px;font-family:system-ui,sans-serif;' +
      `background:${editing ? '#fef3c7' : '#eef2ff'};border:1px solid ${editing ? '#f59e0b' : '#c7d2fe'};`;
    this.innerHTML =
      `<strong>${this.getAttribute('instance-id') ?? '?'}</strong>` +
      `<div style="font-size:12px;opacity:.7">settings ${this.getAttribute('settings') ?? '{}'}</div>` +
      (editing ? '<div style="font-size:11px;color:#b45309">edit mode</div>' : '');
  }
}

function ensureDefined(): void {
  if (customElements.get(DEMO_TAG) === undefined) customElements.define(DEMO_TAG, DemoWidget);
  PageCanvas.define();
}

function widget(i: string, over: Partial<LayoutWidget> = {}): LayoutWidget {
  return { widgetID: { source: 'local', tag: DEMO_TAG }, i, x: 0, y: 0, w: 4, h: 3, ...over };
}

function layout(items: LayoutWidget[], tabs?: { name: string; items: LayoutWidget[] }[]): EffectiveLayout {
  return {
    layout: {
      schemaVersion: 1,
      page: 'demo.page',
      name: 'Demo',
      default: true,
      grid: { items },
      hasTabs: tabs !== undefined,
      tabs: (tabs ?? []).map((t) => ({ name: t.name, grid: { items: t.items } })),
    },
    lockedSlots: [],
  };
}

/** Build a mounted canvas for a story. */
function buildCanvas(configure: (canvas: PageCanvas) => void): HTMLElement {
  ensureDefined();
  const canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
  canvas.context = { record: { recordType: 'customer', id: '42' } };
  configure(canvas);
  return canvas;
}

const meta = {
  title: 'Canvas/PageCanvas',
  render: () =>
    buildCanvas((canvas) => {
      canvas.layout = layout([
        widget('summary', { x: 0, y: 0, w: 6, h: 3, props: { title: 'Summary' } }),
        widget('activity', { x: 6, y: 0, w: 6, h: 3, props: { title: 'Activity' } }),
      ]);
    }),
};
export default meta;

export const Default = {};

export const EditMode = {
  render: () =>
    buildCanvas((canvas) => {
      canvas.editMode = true;
      canvas.layout = layout([widget('summary', { w: 6, props: { title: 'Summary' } })]);
    }),
};

export const Tabs = {
  render: () =>
    buildCanvas((canvas) => {
      canvas.layout = layout(
        [],
        [
          { name: 'Overview', items: [widget('overview', { w: 6 })] },
          { name: 'Details', items: [widget('details', { w: 6 })] },
        ],
      );
    }),
};
