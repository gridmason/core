import { afterEach, expect, test } from 'vitest';

import type { LayoutWidget } from '@gridmason/protocol';

import {
  CANVAS_GEOMETRY_CHANGE_EVENT,
  CANVAS_RENDERED_EVENT,
} from '../../PageCanvas/index.js';
import type { CanvasGeometryChangeDetail, WidgetGeometry } from '../../PageCanvas/index.js';
import type { GridRect } from '../../../engine/placement/index.js';

import { LiveAnnouncer } from './announcer.js';
import { CanvasKeyboardController } from './keyboard-controller.js';
import type { KeyboardEditCanvas, KeyboardEditTarget } from './keyboard-controller.js';

// A canvas double: a real DOM element (so focus + focusin bubbling are real)
// augmented with the three members the controller reads. It also plays the
// EditController's role in the round-trip — folding a dispatched geometry-change
// back into its stored geometry — so successive arrow steps accumulate exactly
// as they would through the real commit + re-render path.
interface Harness {
  canvas: KeyboardEditCanvas & HTMLElement;
  geometryEvents: CanvasGeometryChangeDetail[];
  addItem(id: string, rect: GridRect): void;
  removeItem(id: string): void;
  render(): void;
}

function makeCanvas(): Harness {
  const canvas = document.createElement('div') as HTMLDivElement & KeyboardEditCanvas;
  document.body.appendChild(canvas);
  const items = new Map<string, HTMLElement>();
  const geometry = new Map<string, WidgetGeometry>();
  const geometryEvents: CanvasGeometryChangeDetail[] = [];

  Object.defineProperty(canvas, 'mountedInstanceIds', { get: () => [...items.keys()] });
  canvas.geometryOf = (id) => geometry.get(id);
  canvas.itemElement = (id) => items.get(id);

  // Stand in for the EditController: apply the reported rect to stored geometry.
  canvas.addEventListener(CANVAS_GEOMETRY_CHANGE_EVENT, (e) => {
    const detail = (e as CustomEvent<CanvasGeometryChangeDetail>).detail;
    geometryEvents.push(detail);
    for (const g of detail.geometry) geometry.set(g.i, { ...g });
  });

  return {
    canvas,
    geometryEvents,
    addItem(id, rect) {
      const el = document.createElement('div');
      el.setAttribute('role', 'group');
      canvas.appendChild(el);
      items.set(id, el);
      geometry.set(id, { i: id, ...rect });
    },
    removeItem(id) {
      items.get(id)?.remove();
      items.delete(id);
      geometry.delete(id);
    },
    render() {
      canvas.dispatchEvent(
        new CustomEvent(CANVAS_RENDERED_EVENT, { detail: { instanceIds: [...items.keys()] } }),
      );
    },
  };
}

interface FakeTarget extends KeyboardEditTarget {
  removed: string[];
  added: LayoutWidget[];
  tabsAdded: string[];
  tabsSwitched: number[];
}

function makeTarget(overrides: Partial<KeyboardEditTarget> = {}): FakeTarget {
  const removed: string[] = [];
  const added: LayoutWidget[] = [];
  const tabsAdded: string[] = [];
  const tabsSwitched: number[] = [];
  return {
    editing: true,
    canRemove: () => true,
    isLocked: () => false,
    removeWidget: (id: string) => {
      removed.push(id);
      return true;
    },
    addWidget: (): LayoutWidget => {
      const item: LayoutWidget = {
        widgetID: { source: 'local', tag: 'gm-new' },
        i: `new-${added.length}`,
        x: 0,
        y: 0,
        w: 3,
        h: 2,
      };
      added.push(item);
      return item;
    },
    addTab: (name: string) => tabsAdded.push(name),
    switchTab: (index: number) => tabsSwitched.push(index),
    ...overrides,
    removed,
    added,
    tabsAdded,
    tabsSwitched,
  };
}

const rect = (x: number, y: number, w: number, h: number): GridRect => ({ x, y, w, h });

const cleanup: Array<() => void> = [];
function build(target: FakeTarget, harness: Harness, opts: { labelFor?: (id: string) => string } = {}) {
  const announcer = new LiveAnnouncer({ container: harness.canvas });
  const controller = new CanvasKeyboardController({
    canvas: harness.canvas,
    controller: target,
    announcer,
    ...(opts.labelFor !== undefined ? { labelFor: opts.labelFor } : {}),
  });
  cleanup.push(() => {
    controller.dispose();
    announcer.dispose();
  });
  return { controller, announcer };
}

/** Dispatch a keydown from the focused item so it bubbles to the canvas listener. */
function press(harness: Harness, id: string, key: string, shiftKey = false): void {
  harness.canvas.itemElement(id)?.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  while (cleanup.length > 0) cleanup.pop()!();
  document.body.innerHTML = '';
});

test('applies focusable, named landmarks to every grid item on construction', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  build(makeTarget(), h, { labelFor: () => 'Sales Chart' });
  const el = h.canvas.itemElement('w1')!;
  expect(el.getAttribute('tabindex')).toBe('0');
  expect(el.getAttribute('data-gm-instance')).toBe('w1');
  expect(el.getAttribute('aria-label')).toBe('Sales Chart');
});

test('Enter enters move-mode and arrow keys move the widget through the same commit path', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(4, 4, 3, 2));
  const { controller, announcer } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');

  press(h, 'w1', 'Enter');
  expect(controller.inMoveMode).toBe(true);
  expect(announcer.message).toContain('move mode');

  press(h, 'w1', 'ArrowRight');
  press(h, 'w1', 'ArrowDown');
  // Two commits, and the stored geometry advanced one cell each way.
  expect(h.geometryEvents).toHaveLength(2);
  expect(h.canvas.geometryOf('w1')).toMatchObject({ x: 5, y: 5, w: 3, h: 2 });
  expect(announcer.message).toBe('Moved to column 6, row 6.');
});

test('Shift+arrow resizes the widget in move-mode', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(2, 2, 3, 2));
  const { controller, announcer } = build(makeTarget(), h);
  controller.focus('w1');
  press(h, 'w1', 'Enter');

  press(h, 'w1', 'ArrowRight', true); // wider
  press(h, 'w1', 'ArrowDown', true); // taller
  expect(h.canvas.geometryOf('w1')).toMatchObject({ x: 2, y: 2, w: 4, h: 3 });
  expect(announcer.message).toBe('Resized to 4 columns wide, 3 rows tall.');
});

test('a clamped step at the edge neither commits nor announces', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  const { controller, announcer } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');
  press(h, 'w1', 'Enter');
  announcer.announce(''); // clear the move-mode message

  press(h, 'w1', 'ArrowLeft'); // already at x=0 — clamped, no-op
  expect(h.geometryEvents).toHaveLength(0);
  expect(announcer.message).toBe('');
});

test('Escape restores the placement move-mode started from', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(3, 3, 2, 2));
  const { controller, announcer } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');

  press(h, 'w1', 'Enter');
  press(h, 'w1', 'ArrowRight');
  press(h, 'w1', 'ArrowDown');
  expect(h.canvas.geometryOf('w1')).toMatchObject({ x: 4, y: 4 });

  press(h, 'w1', 'Escape');
  expect(controller.inMoveMode).toBe(false);
  expect(h.canvas.geometryOf('w1')).toMatchObject({ x: 3, y: 3, w: 2, h: 2 }); // restored
  expect(announcer.message).toContain('Move cancelled');
});

test('Enter/Space in move-mode drops and announces the landing cell', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(1, 1, 2, 2));
  const { controller, announcer } = build(makeTarget(), h, { labelFor: () => 'Map' });
  controller.focus('w1');
  press(h, 'w1', 'Enter'); // enter
  press(h, 'w1', 'ArrowRight');
  press(h, 'w1', 'Enter'); // drop
  expect(controller.inMoveMode).toBe(false);
  expect(announcer.message).toBe('Map dropped at column 3, row 2.');
});

test('Delete removes the focused widget and announces it; a locked slot is refused', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  const target = makeTarget();
  const { controller, announcer } = build(target, h, { labelFor: () => 'Map' });
  controller.focus('w1');

  press(h, 'w1', 'Delete');
  expect(target.removed).toEqual(['w1']);
  expect(announcer.message).toBe('Map removed.');

  // Locked / non-removable: refused, announced, not removed.
  const h2 = makeCanvas();
  h2.addItem('lk', rect(0, 0, 3, 2));
  const locked = makeTarget({ canRemove: () => false, isLocked: () => true });
  const built = build(locked, h2, { labelFor: () => 'Header' });
  built.controller.focus('lk');
  press(h2, 'lk', 'Backspace');
  expect(locked.removed).toEqual([]);
  expect(built.announcer.message).toContain('locked');
});

test('a locked widget cannot enter move-mode', () => {
  const h = makeCanvas();
  h.addItem('lk', rect(0, 0, 3, 2));
  const { controller, announcer } = build(makeTarget({ isLocked: () => true }), h, {
    labelFor: () => 'Header',
  });
  controller.focus('lk');
  press(h, 'lk', 'Enter');
  expect(controller.inMoveMode).toBe(false);
  expect(announcer.message).toContain('locked');
});

test('keys are inert when the canvas is not in edit mode', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  const { controller } = build(makeTarget({ editing: false }), h);
  controller.focus('w1');
  press(h, 'w1', 'Enter');
  expect(controller.inMoveMode).toBe(false);
});

test('focusin tracks the focused widget so keys know their subject', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  h.canvas.itemElement('w2')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(controller.focusedInstanceId).toBe('w2');
});

test('add announces and focuses the new widget', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  const target = makeTarget();
  const { controller, announcer } = build(target, h);
  const item = controller.add({ widgetID: { source: 'local', tag: 'gm-new' } }, 'Clock');
  expect(target.added).toHaveLength(1);
  expect(announcer.message).toBe('Clock added.');
  expect(controller.focusedInstanceId).toBe(item.i);
});

test('switchTab and addTab announce the tab', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  const target = makeTarget();
  const { controller, announcer } = build(target, h);
  controller.switchTab(1, 'Details');
  expect(target.tabsSwitched).toEqual([1]);
  expect(announcer.message).toBe('Switched to Details tab.');
  controller.addTab('Extras');
  expect(target.tabsAdded).toEqual(['Extras']);
  expect(announcer.message).toBe('Extras tab added.');
});

test('focus is rescued to a neighbour when the focused widget is removed', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');

  // Remove the focused widget and re-render (as EditController would).
  h.removeItem('w1');
  h.render();

  expect(controller.focusedInstanceId).toBe('w2');
  expect(document.activeElement).toBe(h.canvas.itemElement('w2'));
});

test('focus rescue does not steal focus that moved to a live element outside the widgets', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');

  // Focus deliberately moves to an unrelated live control before the removal.
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  outside.focus();

  h.removeItem('w1');
  h.render();
  expect(document.activeElement).toBe(outside); // not yanked back into the grid
  outside.remove();
});
