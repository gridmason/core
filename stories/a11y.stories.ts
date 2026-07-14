/**
 * Storybook stories for the canvas keyboard alternative + a11y layer (#19, SPEC
 * §7, FR-9) — GW-D20, no story, no merge.
 *
 * Builds a live `<gm-page-canvas>` in edit mode with the keyboard/a11y layer
 * attached ({@link attachCanvasKeyboardA11y}): every placed widget is a landmark
 * in the tab order, and move-mode + arrow keys move/resize the focused widget,
 * each narrated through an ARIA live region whose latest message is echoed below
 * the canvas. The whole loop is pointer-free, so the story doubles as the
 * keyboard-only affordance demo the axe-in-edit-mode e2e asserts against. Shares
 * the demo widget + layout builders with the other canvas stories
 * (`./support.ts`).
 */
import type { EffectiveLayout, ScopeKey } from '../src/engine/layout/index.js';
import { attachCanvasKeyboardA11y, EditController } from '../src/canvas/edit-mode/index.js';
import { PageCanvas } from '../src/canvas/PageCanvas/index.js';
import { DEMO_TAG, ensureWidgetsDefined, singleLayout, widget } from './support.js';

const SCOPE: ScopeKey = { owner: 'user', pageType: 'demo.page' };
const NAMES: Record<string, string> = { w1: 'Widget One', w2: 'Widget Two', locked: 'Header', free: 'Free' };

/** A short instructions banner so the reader knows which keys drive the demo. */
function instructions(): HTMLElement {
  const el = document.createElement('p');
  el.style.cssText = 'font:13px system-ui,sans-serif;color:#334155;margin:0 0 12px;';
  el.innerHTML =
    '<strong>Keyboard only:</strong> <kbd>Tab</kbd> to a widget, <kbd>Enter</kbd> for move mode, ' +
    '<kbd>arrows</kbd> to move, <kbd>Shift</kbd>+<kbd>arrows</kbd> to resize, <kbd>Esc</kbd> to exit. ' +
    'Every action is announced in the live region below.';
  return el;
}

/** Build the demo: canvas + edit controller + attached keyboard/a11y, plus a live-region echo. */
function buildA11yDemo(inherited: EffectiveLayout): HTMLElement {
  ensureWidgetsDefined();
  const root = document.createElement('div');
  root.style.cssText = 'width:1200px;';

  const canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
  canvas.context = { record: { recordType: 'customer', id: '42' } };

  const controller = new EditController({ canvas, persistence: { put: () => {} }, scopeKey: SCOPE, inherited });
  controller.enter();
  const a11y = attachCanvasKeyboardA11y(canvas, controller, { labelFor: (id) => NAMES[id] ?? 'New Widget' });

  // Echo the live region's latest message so the announcement is visible in the
  // story (a real screen reader speaks the same visually-hidden region node).
  const echo = document.createElement('output');
  echo.style.cssText =
    'display:block;margin-top:12px;padding:8px 10px;background:#f1f5f9;border-radius:6px;font:12px system-ui;color:#475569;min-height:1.4em;';
  echo.textContent = '(announcements appear here)';
  const region = a11y.announcer.element;
  new MutationObserver(() => {
    if (region.textContent) echo.textContent = region.textContent;
  }).observe(region, { childList: true, characterData: true, subtree: true });

  root.append(instructions(), canvas, echo);
  return root;
}

const meta = {
  title: 'Canvas/KeyboardA11y',
  render: () =>
    buildA11yDemo(
      singleLayout([
        widget('w1', DEMO_TAG, { x: 0, y: 0, w: 3, h: 2 }),
        widget('w2', DEMO_TAG, { x: 6, y: 0, w: 3, h: 2 }),
      ]),
    ),
};
export default meta;

/** Two widgets in the tab order; drive move/resize with the keyboard alone. */
export const Default = {};

/** A locked slot (`header`) is a landmark but move-mode refuses to move or resize it. */
export const LockedSlot = {
  render: () =>
    buildA11yDemo(
      singleLayout(
        [
          widget('locked', DEMO_TAG, { x: 0, y: 0, w: 12, h: 2, slot: 'header' }),
          widget('free', DEMO_TAG, { x: 0, y: 2, w: 3, h: 2 }),
        ],
        ['header'],
      ),
    ),
};
