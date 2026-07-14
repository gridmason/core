import { expect, test } from '@playwright/test';

// CI perf smoke for the canvas-interactive budget (docs/SPEC.md §7, FR-15):
// **p95 canvas-interactive < 300 ms after data** on a 100-widget page. The
// methodology is deliberately headless-variance-tolerant — see perf/README.md.
//
// Rather than time a single render (a headless browser's first paint is noisy),
// we drive many identical 100-widget builds, discard warm-up runs (JIT/first-
// paint cost), and assert the **p95** of the steady-state runs against a
// CI-adjusted budget. Each measurement is the canvas's own `canvas.interactive`
// perf mark — the data→interactive latency the spec's budget is defined over —
// so the smoke exercises the real telemetry path, not a bespoke timer.

/** The perf control surface the fixture exposes on window. */
interface PerfControl {
  widgetCount: number;
  measure(): { durationMs: number; mountedCount: number };
}
type PerfWindow = Window & { __perf: PerfControl; __perf_ready?: boolean };

const FIXTURE = '/perf/fixtures/hundred-widgets.html';

/** Warm-up runs discarded before measuring (JIT warm-up + first-paint noise). */
const WARMUP = 5;
/** Steady-state measurements the percentiles are computed over. */
const ITERATIONS = 20;
/**
 * CI-adjusted p95 budget (ms). Defaults to the SPEC §7 budget of 300 ms — which
 * is generous headroom for building 100 trivial widgets (locally this lands in
 * the low tens of ms), so the smoke stays green under headless CI variance while
 * still catching a real regression. Override with GM_PERF_BUDGET_MS.
 */
const BUDGET_MS = Number(process.env.GM_PERF_BUDGET_MS ?? 300);

/** Nearest-rank percentile of an unsorted sample. */
function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

test('a 100-widget page meets the canvas-interactive p95 budget', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as unknown as PerfWindow).__perf_ready === true);

  const widgetCount = await page.evaluate(() => (window as unknown as PerfWindow).__perf.widgetCount);
  expect(widgetCount).toBe(100);

  // Warm up (discarded), then collect steady-state measurements.
  for (let i = 0; i < WARMUP; i++) {
    await page.evaluate(() => (window as unknown as PerfWindow).__perf.measure());
  }
  const samples: number[] = [];
  let lastMounted = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await page.evaluate(() => (window as unknown as PerfWindow).__perf.measure());
    samples.push(result.durationMs);
    lastMounted = result.mountedCount;
  }

  // Sanity: this is genuinely a full 100-widget mount each iteration (eager, not
  // virtualized), so the budget is measured against the real worst case.
  expect(lastMounted).toBe(100);

  const p50 = median(samples);
  const p95 = percentile(samples, 95);
  // Surfaced in the Playwright report so a human sees the headroom, not just pass/fail.
  console.log(
    `[perf] 100-widget canvas-interactive over ${ITERATIONS} runs: ` +
      `median=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms budget=${BUDGET_MS}ms`,
  );

  expect(p95, `p95 ${p95.toFixed(1)}ms exceeded the ${BUDGET_MS}ms budget`).toBeLessThan(BUDGET_MS);
});
