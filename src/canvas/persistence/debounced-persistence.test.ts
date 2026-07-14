import { beforeEach, expect, test } from 'vitest';

import type { ScopeKey } from '../../engine/layout/index.js';
import type { LayoutPage } from '@gridmason/protocol';

import { DebouncedLayoutPersistence, DEFAULT_DEBOUNCE_MS } from './debounced-persistence.js';

// A hand-driven timer queue so the debounce window advances only when the test
// says so — no wall-clock, no fake-timer globals. `schedule` returns an integer
// handle; `tick(ms)` fires every timer whose deadline has passed.
type Handle = ReturnType<typeof setTimeout>;

class ManualClock {
  time = 0;
  #next = 1;
  readonly #timers = new Map<number, { at: number; cb: () => void }>();

  readonly now = (): number => this.time;
  readonly schedule = (cb: () => void, ms: number): Handle => {
    const id = this.#next++;
    this.#timers.set(id, { at: this.time + ms, cb });
    return id as unknown as Handle;
  };
  readonly cancel = (handle: Handle): void => {
    this.#timers.delete(handle as unknown as number);
  };

  /** Advance the clock, firing any timer that comes due (in deadline order). */
  tick(ms: number): void {
    this.time += ms;
    for (const [id, t] of [...this.#timers].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= this.time) {
        this.#timers.delete(id);
        t.cb();
      }
    }
  }
}

const KEY: ScopeKey = { owner: 'user', pageType: 'demo.page' };
const OTHER_KEY: ScopeKey = { owner: { node: 'org-1' }, pageType: 'demo.page' };

/** A layout document tagged with `name` so a test can identify which one was written. */
function doc(name: string): LayoutPage {
  return { schemaVersion: 1, page: 'demo.page', name, default: true, grid: { items: [] }, hasTabs: false, tabs: [] };
}

let clock: ManualClock;
let writes: { key: ScopeKey; name: string }[];
let inner: { put: (key: ScopeKey, layout: LayoutPage) => void };

beforeEach(() => {
  clock = new ManualClock();
  writes = [];
  inner = { put: (key, layout) => writes.push({ key, name: layout.name }) };
});

function debounced(opts: Partial<{ delayMs: number; maxWaitMs: number }> = {}): DebouncedLayoutPersistence {
  return new DebouncedLayoutPersistence(inner, {
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
    ...opts,
  });
}

test('a burst of puts coalesces into a single trailing write of the latest document', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  d.put(KEY, doc('b'));
  d.put(KEY, doc('c'));
  expect(writes).toEqual([]); // nothing written mid-burst
  expect(d.pending).toBe(true);

  clock.tick(200);
  expect(writes).toEqual([{ key: KEY, name: 'c' }]); // one write, the most recent doc
  expect(d.pending).toBe(false);
});

test('the debounce timer re-arms on each put, so only quiet time counts', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  clock.tick(150); // not yet quiet
  expect(writes).toEqual([]);
  d.put(KEY, doc('b'));
  clock.tick(150); // 300ms total, but only 150ms since the last put
  expect(writes).toEqual([]);
  clock.tick(50); // now 200ms quiet
  expect(writes).toEqual([{ key: KEY, name: 'b' }]);
});

test('distinct scope keys debounce independently', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  clock.tick(120);
  d.put(OTHER_KEY, doc('x'));
  clock.tick(80); // KEY hits 200ms quiet; OTHER_KEY only 80ms
  expect(writes).toEqual([{ key: KEY, name: 'a' }]);
  clock.tick(120); // OTHER_KEY now quiet
  expect(writes).toEqual([
    { key: KEY, name: 'a' },
    { key: OTHER_KEY, name: 'x' },
  ]);
});

test('flush() writes every pending latest document immediately', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  d.put(OTHER_KEY, doc('x'));
  d.flush();
  expect(writes).toEqual([
    { key: KEY, name: 'a' },
    { key: OTHER_KEY, name: 'x' },
  ]);
  expect(d.pending).toBe(false);
  clock.tick(1000); // timers were cancelled — no double write
  expect(writes).toHaveLength(2);
});

test('flush(key) writes only that scope key', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  d.put(OTHER_KEY, doc('x'));
  d.flush(KEY);
  expect(writes).toEqual([{ key: KEY, name: 'a' }]);
  expect(d.pending).toBe(true); // OTHER_KEY still pending
  clock.tick(200);
  expect(writes).toEqual([
    { key: KEY, name: 'a' },
    { key: OTHER_KEY, name: 'x' },
  ]);
});

test('flush() with nothing pending is a no-op', () => {
  const d = debounced();
  d.flush();
  d.flush(KEY);
  expect(writes).toEqual([]);
});

test('cancel() drops pending writes without persisting', () => {
  const d = debounced({ delayMs: 200 });
  d.put(KEY, doc('a'));
  d.cancel();
  expect(d.pending).toBe(false);
  clock.tick(1000);
  expect(writes).toEqual([]);
});

test('maxWaitMs bounds a continuous burst: a put past the cap flushes immediately', () => {
  const d = debounced({ delayMs: 200, maxWaitMs: 500 });
  d.put(KEY, doc('a')); // firstAt = 0
  clock.tick(150);
  d.put(KEY, doc('b')); // 150ms — re-arms
  clock.tick(150);
  d.put(KEY, doc('c')); // 300ms — re-arms
  clock.tick(150);
  d.put(KEY, doc('d')); // 450ms — still under the 500ms cap, re-arms
  expect(writes).toEqual([]);
  clock.tick(60); // 510ms total
  d.put(KEY, doc('e')); // past the cap since firstAt → flush now
  expect(writes).toEqual([{ key: KEY, name: 'e' }]);
});

test('defaults to a 200ms debounce window', () => {
  expect(DEFAULT_DEBOUNCE_MS).toBe(200);
  const d = new DebouncedLayoutPersistence(inner, { schedule: clock.schedule, cancel: clock.cancel, now: clock.now });
  d.put(KEY, doc('a'));
  clock.tick(199);
  expect(writes).toEqual([]);
  clock.tick(1);
  expect(writes).toEqual([{ key: KEY, name: 'a' }]);
});

test('uses real setTimeout by default (integration-ish smoke)', async () => {
  const d = new DebouncedLayoutPersistence(inner, { delayMs: 5 });
  d.put(KEY, doc('a'));
  d.put(KEY, doc('b'));
  await new Promise((r) => setTimeout(r, 20));
  expect(writes).toEqual([{ key: KEY, name: 'b' }]);
});
