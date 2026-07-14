import { defineConfig, devices } from '@playwright/test';

// Canvas e2e harness. The C-E3 mounting foundation (issue #17) adds the first
// real browser specs — `page-canvas.spec.ts` drives the built `@gridmason/core`
// canvas ESM and the real gridstack against a static fixture served by
// `e2e/server.mjs`. The `webServer` builds `dist/` and serves the repo root so
// the fixture's import map resolves `/dist/...` and `/node_modules/...` exactly
// as a real host would. CI must run `npx playwright install --with-deps chromium`
// before `npm run e2e` (see .github/workflows/ci.yml). The issue #6 smoke spec
// (no `page` fixture) still runs — it simply never navigates.
const PORT = Number(process.env.GM_E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node e2e/server.mjs',
    url: `${BASE_URL}/e2e/fixtures/page-canvas.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
