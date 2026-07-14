import { expect, test } from '@playwright/test';

import { gotoFixture } from './support/harness.js';

// Regression proof for #63: on the **first** client-side mount of
// `<gm-page-canvas>` into a freshly-attached full-width container, a placed grid
// item must render at its correct percentage width *immediately* — not collapse
// to content width until a reflow (~1.5 s self-correct / window resize) later.
// The fixture drives the imperative mount an SPA host uses (create container →
// append canvas → assign `layout`) and measures the placed item's real box on the
// next frame, with no resize event and no timeout crutch.

interface FirstMountMeasure {
  w: number;
  gridWidth: number;
  itemWidth: number;
  colWidthVar: string;
}
type GmWindow = Window & { __gm: { mountAndMeasure(w: number): Promise<FirstMountMeasure> } };

test.beforeEach(async ({ page }) => {
  await gotoFixture(page, '/e2e/fixtures/first-mount.html', '__gm_ready');
});

test('a full-width item fills the grid immediately on first mount (no reflow)', async ({ page }) => {
  const m = await page.evaluate(() => (window as unknown as GmWindow).__gm.mountAndMeasure(12));

  // Sanity: the containing block resolved to a real, full-width box and the
  // column-width CSS var is the expected 12-column fraction the whole time.
  expect(m.gridWidth).toBeGreaterThan(400);
  expect(m.colWidthVar.startsWith('8.3333')).toBe(true);

  // A w=12 item spans every column, so it fills the grid box (allow a couple px
  // for gridstack's item margins). The bug rendered it at ~content width.
  expect(m.itemWidth).toBeGreaterThanOrEqual(m.gridWidth - 4);
});

test('a partial-width item resolves to its column fraction on first mount', async ({ page }) => {
  // Not just "everything snaps to full width": a w=6 item must resolve to ~half
  // the 12-column grid immediately, proving the fix re-resolves the real
  // percentage width rather than forcing a full-width fallback.
  const m = await page.evaluate(() => (window as unknown as GmWindow).__gm.mountAndMeasure(6));

  expect(m.gridWidth).toBeGreaterThan(400);
  const ratio = m.itemWidth / m.gridWidth;
  expect(ratio).toBeGreaterThan(0.4);
  expect(ratio).toBeLessThan(0.55);
});
