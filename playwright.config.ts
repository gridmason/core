import { defineConfig } from '@playwright/test';

// Playwright harness STUB (issue #6 scaffold). The real canvas e2e — driving a
// gridstack page in a browser — lands with the C-E2/C-E4 epics (SPEC §9). This
// config exists so those issues extend a working harness rather than bootstrap
// one; the single smoke spec under e2e/ asserts the runner works without
// launching a browser (no `page` fixture), so CI needs no browser download yet.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
});
