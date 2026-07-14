import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

// The repo root (this config lives in perf/), so the webServer's `npm run build`
// and `node e2e/server.mjs` resolve from the project root, not perf/.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Playwright config for the **canvas perf smoke** (docs/SPEC.md §7, FR-15),
// separate from the correctness e2e (`playwright.config.ts`). The perf smoke is a
// timing measurement, so it is kept out of the functional e2e run — it can be run
// on its own cadence (`npm run perf`) without gating the correctness suite on
// headless timing variance. It reuses the same dependency-free static server
// (`e2e/server.mjs`) and builds `dist/` first, so the 100-widget fixture's import
// map resolves `/dist/...` and `/node_modules/...` exactly as a real host would.
//
// Methodology (warm-up, iterations, p95 vs a CI-adjusted budget) is documented in
// perf/README.md; the budget is overridable via GM_PERF_BUDGET_MS.
const PORT = Number(process.env.GM_E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One worker: perf timing must not contend with a parallel browser for CPU.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node e2e/server.mjs',
    cwd: repoRoot,
    url: `${BASE_URL}/perf/fixtures/hundred-widgets.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
