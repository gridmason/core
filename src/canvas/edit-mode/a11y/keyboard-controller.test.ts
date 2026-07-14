import { afterEach, expect, test } from 'vitest';

import type { LayoutWidget } from '@gridmason/protocol';

import {
  CANVAS_GEOMETRY_CHANGE_EVENT,
  CANVAS_RENDERED_EVENT,
  CANVAS_WIDGET_MOUNTED_EVENT,
  CANVAS_WIDGET_UNMOUNTED_EVENT,
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
  /** Place a grid item element that is **not** mounted yet — models a virtualized offscreen item. */
  lazyPlace(id: string, rect: GridRect): void;
  /** Mark a placed item mounted and fire the virtualizer's `gm:widget-mounted` for it. */
  mount(id: string): void;
  /** Mark a placed item unmounted (its element stays placed) and fire `gm:widget-unmounted` for it. */
  unmount(id: string): void;
  render(): void;
}

function makeCanvas(): Harness {
  const canvas = document.createElement('div') as HTMLDivElement & KeyboardEditCanvas;
  document.body.appendChild(canvas);
  // `items` is every **placed** grid item element (drives itemElement/geometry);
  // `mounted` is the subset whose widget is mounted (drives mountedInstanceIds).
  // They diverge under virtualization: an offscreen item stays placed but unmounted.
  const items = new Map<string, HTMLElement>();
  const mounted = new Set<string>();
  const geometry = new Map<string, WidgetGeometry>();
  const geometryEvents: CanvasGeometryChangeDetail[] = [];

  Object.defineProperty(canvas, 'mountedInstanceIds', { get: () => [...mounted] });
  canvas.geometryOf = (id) => geometry.get(id);
  canvas.itemElement = (id) => items.get(id);

  // Stand in for the EditController: apply the reported rect to stored geometry.
  canvas.addEventListener(CANVAS_GEOMETRY_CHANGE_EVENT, (e) => {
    const detail = (e as CustomEvent<CanvasGeometryChangeDetail>).detail;
    geometryEvents.push(detail);
    for (const g of detail.geometry) geometry.set(g.i, { ...g });
  });

  const place = (id: string, rect: GridRect): void => {
    const el = document.createElement('div');
    el.setAttribute('role', 'group');
    canvas.appendChild(el);
    items.set(id, el);
    geometry.set(id, { i: id, ...rect });
  };

  return {
    canvas,
    geometryEvents,
    addItem(id, rect) {
      place(id, rect);
      mounted.add(id);
    },
    removeItem(id) {
      items.get(id)?.remove();
      items.delete(id);
      mounted.delete(id);
      geometry.delete(id);
    },
    lazyPlace(id, rect) {
      place(id, rect); // placed but not added to `mounted`
    },
    mount(id) {
      mounted.add(id);
      canvas.dispatchEvent(
        new CustomEvent(CANVAS_WIDGET_MOUNTED_EVENT, { detail: { instanceId: id } }),
      );
    },
    unmount(id) {
      // Virtualization drops the widget content but leaves the grid item placed.
      mounted.delete(id);
      canvas.dispatchEvent(
        new CustomEvent(CANVAS_WIDGET_UNMOUNTED_EVENT, { detail: { instanceId: id } }),
      );
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

test('a widget the virtualizer mounts lazily gains a landmark from the gm:widget-mounted event', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2)); // on-screen, landmarked at construction
  build(makeTarget(), h, { labelFor: (id) => (id === 'w2' ? 'Sales' : 'W') });

  // w2 is placed offscreen (virtualized) — not mounted, so not landmarked yet.
  h.lazyPlace('w2', rect(0, 100, 3, 2));
  const el = h.canvas.itemElement('w2')!;
  expect(el.getAttribute('data-gm-instance')).toBeNull();
  expect(el.getAttribute('tabindex')).toBeNull();

  h.mount('w2'); // scrolls into the band → gm:widget-mounted
  expect(el.getAttribute('data-gm-instance')).toBe('w2');
  expect(el.getAttribute('tabindex')).toBe('0');
  expect(el.getAttribute('aria-label')).toBe('Sales');
});

test('a widget scrolled out then back in loses and regains its landmark', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  build(makeTarget(), h, { labelFor: () => 'W' });
  const el = h.canvas.itemElement('w1')!;
  expect(el.getAttribute('tabindex')).toBe('0'); // landmarked at construction

  h.unmount('w1'); // scroll out → landmark dropped
  expect(el.getAttribute('data-gm-instance')).toBeNull();
  expect(el.getAttribute('tabindex')).toBeNull();

  h.mount('w1'); // scroll back in → landmark restored
  expect(el.getAttribute('data-gm-instance')).toBe('w1');
  expect(el.getAttribute('tabindex')).toBe('0');
});

test('a gm:widget-mounted for an instance with no grid item is a safe no-op', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  build(makeTarget(), h, { labelFor: () => 'W' });
  expect(() => h.mount('ghost')).not.toThrow();
});

test('focus is rescued when the virtualizer unmounts the focused widget, and its landmark is dropped', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');
  expect(document.activeElement).toBe(h.canvas.itemElement('w1'));

  // w1 scrolls out of the band → virtualizer unmounts it (element stays placed).
  h.unmount('w1');

  // Focus moved to the surviving mounted neighbour — never stranded on the emptied cell.
  expect(controller.focusedInstanceId).toBe('w2');
  expect(document.activeElement).toBe(h.canvas.itemElement('w2'));
  // The torn-down widget is no longer a keyboard target: its landmark is stripped.
  const w1El = h.canvas.itemElement('w1')!;
  expect(w1El.getAttribute('data-gm-instance')).toBeNull();
  expect(w1El.getAttribute('tabindex')).toBeNull();
  expect(w1El.getAttribute('aria-label')).toBeNull();
});

test('the virtualizer unmounting an unfocused widget drops its landmark but leaves focus alone', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');

  h.unmount('w2'); // a different widget scrolls out
  expect(controller.focusedInstanceId).toBe('w1');
  expect(document.activeElement).toBe(h.canvas.itemElement('w1'));
  expect(h.canvas.itemElement('w2')!.getAttribute('data-gm-instance')).toBeNull();
});

test('the virtualizer unmounting the move-mode subject clears move-mode and rescues focus', () => {
  const h = makeCanvas();
  h.addItem('w1', rect(0, 0, 3, 2));
  h.addItem('w2', rect(3, 0, 3, 2));
  const { controller } = build(makeTarget(), h, { labelFor: () => 'W' });
  controller.focus('w1');
  press(h, 'w1', 'Enter'); // enter move-mode on w1
  expect(controller.inMoveMode).toBe(true);

  h.unmount('w1');
  expect(controller.inMoveMode).toBe(false);
  expect(controller.focusedInstanceId).toBe('w2');
});
