import { beforeEach, expect, test } from 'vitest';

import { CanvasVirtualizer, DEFAULT_ROOT_MARGIN } from './virtualizer.js';
import type { VirtualizerObserver, VirtualizerObserverEntry } from './virtualizer.js';

// A hand-driven IntersectionObserver stand-in: it records observed targets and
// lets a test push intersection changes on demand (`enter`/`leave`), so mount/
// unmount transitions are deterministic without a real layout engine.
class FakeObserver implements VirtualizerObserver {
  readonly observed = new Set<Element>();
  #callback: (entries: readonly VirtualizerObserverEntry[]) => void = () => {};

  bind(callback: (entries: readonly VirtualizerObserverEntry[]) => void): this {
    this.#callback = callback;
    return this;
  }
  observe(target: Element): void {
    this.observed.add(target);
  }
  unobserve(target: Element): void {
    this.observed.delete(target);
  }
  disconnect(): void {
    this.observed.clear();
  }
  /** Report an intersection state change for the given targets. */
  emit(...entries: { target: Element; isIntersecting: boolean }[]): void {
    this.#callback(entries);
  }
  enter(...targets: Element[]): void {
    this.emit(...targets.map((target) => ({ target, isIntersecting: true })));
  }
  leave(...targets: Element[]): void {
    this.emit(...targets.map((target) => ({ target, isIntersecting: false })));
  }
}

let observer: FakeObserver;
let mounts: string[];
let unmounts: string[];

/** Build a virtualizer whose observer this test drives, recording mount/unmount calls. */
function makeVirtualizer(): CanvasVirtualizer {
  return new CanvasVirtualizer(
    { mount: (id) => mounts.push(id), unmount: (id) => unmounts.push(id) },
    { createObserver: (cb) => observer.bind(cb) },
  );
}

function el(): HTMLElement {
  return document.createElement('div');
}

beforeEach(() => {
  observer = new FakeObserver();
  mounts = [];
  unmounts = [];
});

test('observing a target does not mount until it intersects the near-viewport band', () => {
  const v = makeVirtualizer();
  const a = el();
  v.observe('a', a);
  expect(observer.observed.has(a)).toBe(true);
  expect(mounts).toEqual([]); // observed, not yet on screen
  expect(v.isMounted('a')).toBe(false);

  observer.enter(a);
  expect(mounts).toEqual(['a']);
  expect(v.isMounted('a')).toBe(true);
});

test('a target leaving the band unmounts it (honoring the teardown path)', () => {
  const v = makeVirtualizer();
  const a = el();
  v.observe('a', a);
  observer.enter(a);
  observer.leave(a);
  expect(unmounts).toEqual(['a']);
  expect(v.isMounted('a')).toBe(false);
});

test('mount/unmount fire only on a state transition, never repeatedly', () => {
  const v = makeVirtualizer();
  const a = el();
  v.observe('a', a);
  observer.enter(a);
  observer.enter(a); // already intersecting → no second mount
  expect(mounts).toEqual(['a']);
  observer.leave(a);
  observer.leave(a); // already gone → no second unmount
  expect(unmounts).toEqual(['a']);
});

test('only near-viewport widgets mount on a long page (mount count << total)', () => {
  const v = makeVirtualizer();
  const targets = Array.from({ length: 100 }, () => el());
  targets.forEach((t, i) => v.observe(`w${i}`, t));
  expect(mounts).toEqual([]);

  // Only the first eight are near the viewport initially.
  observer.enter(...targets.slice(0, 8));
  expect(mounts).toHaveLength(8);
  expect(v.mountedIds).toHaveLength(8);
  expect(mounts.length).toBeLessThan(targets.length);

  // Scroll: the next band enters, the first leaves.
  observer.leave(...targets.slice(0, 4));
  observer.enter(...targets.slice(8, 12));
  expect([...v.mountedIds].sort()).toEqual(['w10', 'w11', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'].sort());
});

test('unobserve stops tracking without firing an unmount (the caller owns removal)', () => {
  const v = makeVirtualizer();
  const a = el();
  v.observe('a', a);
  observer.enter(a);
  expect(mounts).toEqual(['a']);

  v.unobserve('a');
  expect(unmounts).toEqual([]); // removal is the caller's teardown, not a virtualization unmount
  expect(observer.observed.has(a)).toBe(false);
  expect(v.isMounted('a')).toBe(false);

  observer.enter(a); // a stale entry for the now-untracked target is ignored
  expect(mounts).toEqual(['a']);
});

test('re-observing an instance with a new target re-points and drops the old one', () => {
  const v = makeVirtualizer();
  const a1 = el();
  const a2 = el();
  v.observe('a', a1);
  v.observe('a', a2);
  expect(observer.observed.has(a1)).toBe(false);
  expect(observer.observed.has(a2)).toBe(true);

  observer.enter(a1); // stale target → ignored
  expect(mounts).toEqual([]);
  observer.enter(a2);
  expect(mounts).toEqual(['a']);
});

test('disconnect stops observing everything and fires no callbacks', () => {
  const v = makeVirtualizer();
  const a = el();
  v.observe('a', a);
  observer.enter(a);
  v.disconnect();
  expect(observer.observed.size).toBe(0);
  expect(v.mountedIds).toEqual([]);
  expect(unmounts).toEqual([]);
});

test('default rootMargin is exported for the host-facing knob', () => {
  expect(DEFAULT_ROOT_MARGIN).toBe('256px');
});

test('with no IntersectionObserver available, the default factory mounts eagerly', () => {
  // Prove the graceful-degradation branch: the real global is a happy-dom stub
  // that never fires, so temporarily remove it and use the built-in default.
  const saved = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  try {
    const eager: string[] = [];
    const v = new CanvasVirtualizer({ mount: (id) => eager.push(id), unmount: () => {} });
    v.observe('a', el());
    expect(eager).toEqual(['a']); // no observer → mount immediately
    v.disconnect();
  } finally {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = saved;
  }
});
