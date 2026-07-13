import { expect, test } from '@playwright/test';

// Scaffold smoke spec: proves the Playwright runner is wired and executes in CI.
// It deliberately uses no `page` fixture, so no browser is launched or
// downloaded yet — the real canvas e2e (mounting <gm-page-canvas>, drag/resize,
// keyboard a11y) lands with the C-E2/C-E4 epics and will add browser projects.
test('the e2e harness runs', () => {
  expect(1 + 1).toBe(2);
});
