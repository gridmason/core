import type { Page } from '@playwright/test';

// Shared Playwright harness for the canvas e2e suite (docs/testing.md). Every
// canvas fixture boots the built `@gridmason/core` ESM against a real gridstack
// and, once wired, sets a `window.<flag>` boolean and hangs a control surface on
// `window` for its spec to drive. This module removes the copy-paste that boot
// handshake would otherwise repeat in every spec's `beforeEach`.

/**
 * Navigate to a fixture and wait until it signals ready. `readyFlag` is the
 * global the fixture sets last (e.g. `__gm_ready`) — the barrier that guarantees
 * the canvas ESM loaded, the widgets are defined, and the control surface is
 * installed before the spec touches it.
 */
export async function gotoFixture(page: Page, path: string, readyFlag: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction((flag) => (window as unknown as Record<string, unknown>)[flag] === true, readyFlag);
}
