import { beforeEach, expect, test } from 'vitest';

import { CanvasPerfMarker, CANVAS_PERF } from './marks.js';
import type { CanvasInteractiveEvent, PerformanceLike } from './marks.js';

// A stub `performance` recording the User Timing calls the marker makes, with a
// clock the test advances so durations are exact.
class FakePerformance implements PerformanceLike {
  clock = 0;
  readonly calls: string[] = [];
  now = (): number => this.clock;
  mark = (name: string): void => void this.calls.push(`mark:${name}`);
  measure = (name: string, start?: string, end?: string): void =>
    void this.calls.push(`measure:${name}:${start}:${end}`);
  clearMarks = (name?: string): void => void this.calls.push(`clearMarks:${name}`);
  clearMeasures = (name?: string): void => void this.calls.push(`clearMeasures:${name}`);
}

let perf: FakePerformance;
let events: CanvasInteractiveEvent[];

function makeMarker(): CanvasPerfMarker {
  return new CanvasPerfMarker({ performance: perf, now: () => perf.now(), telemetry: (e) => events.push(e) });
}

beforeEach(() => {
  perf = new FakePerformance();
  events = [];
});

test('begin → settle emits a canvas.interactive event with the elapsed duration', () => {
  const m = makeMarker();
  m.begin();
  perf.clock = 42;
  m.settle({ placedCount: 100, mountedCount: 8, virtualized: true });
  expect(events).toEqual([
    { type: 'canvas.interactive', durationMs: 42, placedCount: 100, mountedCount: 8, virtualized: true },
  ]);
});

test('records User Timing begin/end marks and the begin→end measure', () => {
  const m = makeMarker();
  m.begin();
  m.settle({ placedCount: 1, mountedCount: 1, virtualized: false });
  expect(perf.calls).toContain(`mark:${CANVAS_PERF.begin}`);
  expect(perf.calls).toContain(`mark:${CANVAS_PERF.end}`);
  expect(perf.calls).toContain(`measure:${CANVAS_PERF.measure}:${CANVAS_PERF.begin}:${CANVAS_PERF.end}`);
});

test('clears its User Timing entries so the buffer never grows unbounded', () => {
  const m = makeMarker();
  m.begin();
  m.settle({ placedCount: 1, mountedCount: 1, virtualized: false });
  expect(perf.calls).toContain(`clearMarks:${CANVAS_PERF.begin}`);
  expect(perf.calls).toContain(`clearMarks:${CANVAS_PERF.end}`);
  expect(perf.calls).toContain(`clearMeasures:${CANVAS_PERF.measure}`);
});

test('settle with no open measurement is a no-op (a render not triggered by data)', () => {
  const m = makeMarker();
  m.settle({ placedCount: 1, mountedCount: 1, virtualized: false });
  expect(events).toEqual([]);
});

test('a fresh begin restarts the measurement from the newer data', () => {
  const m = makeMarker();
  m.begin();
  perf.clock = 10;
  m.begin(); // newer data arrives before the first settle
  perf.clock = 25;
  m.settle({ placedCount: 2, mountedCount: 2, virtualized: false });
  expect(events[0]?.durationMs).toBe(15); // measured from the second begin (10 → 25)
});

test('duration never goes negative if the clock is non-monotonic', () => {
  const m = makeMarker();
  perf.clock = 100;
  m.begin();
  perf.clock = 90; // clock went backwards
  m.settle({ placedCount: 1, mountedCount: 1, virtualized: false });
  expect(events[0]?.durationMs).toBe(0);
});

test('setTelemetry wires a sink after construction', () => {
  const m = new CanvasPerfMarker({ performance: perf, now: () => perf.now() });
  const late: CanvasInteractiveEvent[] = [];
  m.begin();
  m.setTelemetry((e) => late.push(e));
  perf.clock = 7;
  m.settle({ placedCount: 3, mountedCount: 3, virtualized: false });
  expect(late).toHaveLength(1);
  expect(late[0]?.durationMs).toBe(7);
});

test('still emits telemetry when no performance surface is available', () => {
  const m = new CanvasPerfMarker({ performance: undefined, now: (() => { let t = 0; return () => (t += 5); })(), telemetry: (e) => events.push(e) });
  m.begin(); // now() → 5
  m.settle({ placedCount: 1, mountedCount: 1, virtualized: false }); // now() → 10
  expect(events).toHaveLength(1);
  expect(events[0]?.durationMs).toBe(5);
});

test('a throwing performance implementation never breaks the render or the event', () => {
  const hostile: PerformanceLike = {
    now: () => 0,
    mark: () => { throw new Error('boom'); },
  };
  const m = new CanvasPerfMarker({ performance: hostile, now: (() => { let t = 0; return () => (t += 3); })(), telemetry: (e) => events.push(e) });
  expect(() => {
    m.begin();
    m.settle({ placedCount: 1, mountedCount: 1, virtualized: false });
  }).not.toThrow();
  expect(events).toHaveLength(1); // telemetry still fired despite the mark() throw
});
