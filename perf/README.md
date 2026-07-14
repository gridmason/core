# Canvas perf smoke

The canvas performance budget (docs/SPEC.md §7, FR-15):

> **p95 canvas-interactive < 300 ms after data.**

"Canvas-interactive after data" is the latency from a host assigning a resolved
layout to `<gm-page-canvas>` (the *data* arriving) to the canvas having built the
grid and mounted its on-screen widgets (the canvas being *interactive*). The
engine measures this window itself and emits it as a `canvas.interactive`
telemetry mark (`src/canvas/perf/`); this smoke drives that mark on a fixed
100-widget page and checks its **p95** against a budget.

## Why a smoke, and why it is not flaky

A single render timing in a headless browser is noisy — first paint, JIT warm-up,
and CI CPU contention all inflate a one-shot measurement, which would make a naive
`expect(duration < 300)` flake. The methodology removes that variance:

- **Fixed fixture** — `fixtures/hundred-widgets.html` builds a 100-widget
  single-grid layout of trivial synchronous widgets, so the measurement is the
  pure engine + canvas build/mount cost, with no widget async work confounding it.
- **Full build every iteration** — each measurement toggles between two layouts
  with *disjoint* instance ids, so every run fully unmounts the previous 100 and
  mounts a fresh 100 (the worst case), never an incremental reconcile.
- **Warm-up runs discarded** — the first `WARMUP` (5) measurements are thrown
  away so JIT warm-up and first-paint cost do not pollute the sample.
- **p95 over N steady-state runs** — `ITERATIONS` (20) measurements are collected
  and the **95th percentile** (nearest-rank) is asserted, not the max or a single
  run, so one unlucky GC pause cannot fail the build.
- **CI-adjusted budget** — the asserted budget defaults to the SPEC figure of
  **300 ms**, which is deliberately generous headroom: building 100 trivial
  widgets lands in the low tens of milliseconds locally, so 300 ms absorbs
  headless CI variance while still catching a real regression (e.g. an
  accidental O(n²) in the mount path). Override it with `GM_PERF_BUDGET_MS` to
  tighten the gate on a known-stable runner.

Both `median` and `p95` are logged to the Playwright report each run, so a human
can watch the headroom trend rather than only seeing pass/fail.

## Running

```sh
npm run perf                      # build dist, serve, run the smoke
GM_PERF_BUDGET_MS=150 npm run perf # assert a tighter budget
GM_E2E_PORT=4200 npm run perf      # avoid a port clash with a parallel e2e run
```

The smoke uses its own Playwright config (`perf.config.ts`, single worker) so it
is **separate from the correctness e2e** (`playwright.config.ts`): a timing
measurement should run on its own cadence and never gate the functional suite on
headless timing variance. It reuses `e2e/server.mjs` and requires the Chromium
browser (`npx playwright install --with-deps chromium`), same as the e2e job.

## Virtualization

This smoke measures the eager (non-virtualized) path — the worst case, where all
100 widgets mount. Offscreen-widget **virtualization** (`src/canvas/virtualization/`)
is what keeps the *rendered* page bounded regardless of widget count in
production; its mount-count behavior is covered by the unit and integration tests
(`virtualizer.test.ts`, `page-canvas.virtualization.test.ts`), not this timing
smoke.
