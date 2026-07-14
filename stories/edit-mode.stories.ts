/**
 * Storybook story for edit mode (GW-D20 — no story, no merge; FR-9).
 *
 * Builds a live `<gm-page-canvas>` driven by an {@link EditController} in edit
 * mode, with a small toolbar demonstrating the pointer-free operations — add,
 * remove, and (on the tabbed story) add/rename/switch tab — each persisting
 * through an in-memory persistence double whose latest doc is shown beneath the
 * canvas. Drag and resize are pointer gestures the reader performs directly on
 * the grid. Shares the demo widget + layout builders with the other canvas
 * stories (`./support.ts`).
 */
import type { LayoutPage } from '@gridmason/protocol';

import type { EffectiveLayout, ScopeKey } from '../src/engine/layout/index.js';
import { EditController } from '../src/canvas/edit-mode/index.js';
import { PageCanvas } from '../src/canvas/PageCanvas/index.js';
import { DEMO_TAG, ensureWidgetsDefined, singleLayout, tabbedLayout, widget } from './support.js';

const SCOPE: ScopeKey = { owner: 'user', pageType: 'demo.page' };

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
  ensureWidgetsDefined();
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
  render: () => buildEditDemo(singleLayout([widget('summary', undefined, { x: 0, y: 0, w: 6, h: 3 })])),
};
export default meta;

/** Add and remove widgets; drag/resize the placed widgets directly on the grid. */
export const Default = {};

/** A locked slot (`header`) shows no remove affordance and cannot be dragged or resized. */
export const LockedSlot = {
  render: () =>
    buildEditDemo(
      singleLayout(
        [
          widget('header', undefined, { x: 0, y: 0, w: 12, h: 2, slot: 'header' }),
          widget('body', undefined, { x: 0, y: 2, w: 6, h: 3 }),
        ],
        ['header'],
      ),
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
    buildEditDemo(tabbedLayout([{ name: 'Overview', items: [] }]), { allowTabs: true }, (controller) => [
      button('Add tab', () => controller.addTab(`Tab ${Date.now() % 100}`)),
      button('Rename first tab', () => controller.renameTab(0, 'Renamed')),
      button('Switch to tab 2', () => controller.switchTab(1)),
    ]),
};
