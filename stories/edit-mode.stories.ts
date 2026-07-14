/**
 * Storybook story for edit mode (GW-D20 — no story, no merge; FR-9).
 *
 * Builds a live `<gm-page-canvas>` driven by an {@link EditController} in edit
 * mode, with a small toolbar demonstrating the pointer-free operations — add,
 * remove, and (on the tabbed story) add/rename/switch tab — each persisting
 * through an in-memory persistence double whose latest doc is shown beneath the
 * canvas. Drag and resize are pointer gestures the reader performs directly on
 * the grid (the canvas is in edit mode). Framework-agnostic CSF, like the
 * PageCanvas story; the stubbed Storybook harness renders it unchanged when the
 * real config lands (C-E4).
 */
import type { LayoutPage } from '@gridmason/protocol';

import type { EffectiveLayout, ScopeKey } from '../src/engine/layout/index.js';
import { EditController } from '../src/canvas/edit-mode/index.js';
import { PageCanvas } from '../src/canvas/PageCanvas/index.js';

const DEMO_TAG = 'gm-demo-widget';
const SCOPE: ScopeKey = { owner: 'user', pageType: 'demo.page' };

/** A tiny self-describing demo widget (mirrors the PageCanvas story's widget). */
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
    this.innerHTML = `<strong>${this.getAttribute('instance-id') ?? '?'}</strong>`;
  }
}

function ensureDefined(): void {
  if (customElements.get(DEMO_TAG) === undefined) customElements.define(DEMO_TAG, DemoWidget);
  PageCanvas.define();
}

function effective(items: { i: string; x: number; y: number; w: number; h: number; slot?: string }[]): EffectiveLayout {
  return {
    layout: {
      schemaVersion: 1,
      page: 'demo.page',
      name: 'Demo',
      default: true,
      grid: {
        items: items.map((it) => ({
          widgetID: { source: 'local', tag: DEMO_TAG },
          i: it.i,
          x: it.x,
          y: it.y,
          w: it.w,
          h: it.h,
          ...(it.slot !== undefined ? { slot: it.slot } : {}),
        })),
      },
      hasTabs: false,
      tabs: [],
    },
    lockedSlots: items.some((it) => it.slot === 'header') ? ['header'] : [],
  };
}

function tabbedEffective(): EffectiveLayout {
  return {
    layout: {
      schemaVersion: 1,
      page: 'demo.page',
      name: 'Demo',
      default: true,
      grid: { items: [] },
      hasTabs: true,
      tabs: [{ name: 'Overview', grid: { items: [] } }],
    },
    lockedSlots: [],
  };
}

/** A labelled toolbar button. */
function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.style.cssText = 'padding:6px 10px;margin-right:6px;border-radius:6px;border:1px solid #c7d2fe;cursor:pointer;';
  el.addEventListener('click', onClick);
  return el;
}

/** Build the demo: canvas + controller + toolbar + a live view of the persisted doc. */
function buildEditDemo(
  inherited: EffectiveLayout,
  options: { allowTabs?: boolean } = {},
  toolbar?: (controller: EditController, refresh: () => void) => HTMLElement[],
): HTMLElement {
  ensureDefined();
  const root = document.createElement('div');
  const stored: { doc: LayoutPage | undefined } = { doc: undefined };

  const canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
  canvas.context = { record: { recordType: 'customer', id: '42' } };

  const controller = new EditController({
    canvas,
    persistence: {
      put: (_key, doc) => {
        stored.doc = doc;
        refresh();
      },
    },
    scopeKey: SCOPE,
    inherited,
    allowTabs: options.allowTabs ?? false,
  });

  const persisted = document.createElement('pre');
  persisted.style.cssText = 'margin-top:12px;padding:8px;background:#f8fafc;border-radius:6px;font-size:11px;overflow:auto;';
  const refresh = (): void => {
    persisted.textContent = stored.doc
      ? JSON.stringify(stored.doc, null, 2)
      : '(inheriting — no personal copy persisted yet)';
  };
  refresh();

  const bar = document.createElement('div');
  bar.style.cssText = 'margin-bottom:12px;';
  const addBtn = button('Add widget', () => controller.addWidget({ widgetID: { source: 'local', tag: DEMO_TAG } }));
  bar.append(addBtn, ...(toolbar?.(controller, refresh) ?? []));

  controller.enter();
  root.append(bar, canvas, persisted);
  return root;
}

const meta = {
  title: 'Canvas/EditMode',
  render: () => buildEditDemo(effective([{ i: 'summary', x: 0, y: 0, w: 6, h: 3 }])),
};
export default meta;

/** Add and remove widgets; drag/resize the placed widgets directly on the grid. */
export const Default = {};

/** A locked slot (`header`) shows no remove affordance and cannot be dragged or resized. */
export const LockedSlot = {
  render: () =>
    buildEditDemo(
      effective([
        { i: 'header', x: 0, y: 0, w: 12, h: 2, slot: 'header' },
        { i: 'body', x: 0, y: 2, w: 6, h: 3 },
      ]),
      {},
      (controller) => [
        button('Remove body', () => controller.removeWidget('body')),
        button('Remove header (locked → no-op)', () => controller.removeWidget('header')),
      ],
    ),
};

/** Tab authoring: add a tab, rename it, and switch between tabs. */
export const Tabs = {
  render: () =>
    buildEditDemo(tabbedEffective(), { allowTabs: true }, (controller) => [
      button('Add tab', () => controller.addTab(`Tab ${Date.now() % 100}`)),
      button('Rename first tab', () => controller.renameTab(0, 'Renamed')),
      button('Switch to tab 2', () => controller.switchTab(1)),
    ]),
};
