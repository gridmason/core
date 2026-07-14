import { expect, test } from '@playwright/test';

import { gotoFixture } from './support/harness.js';

// End-to-end proof of the canvas mount + lifecycle guarantee (issue #17, FR-8,
// FR-11) in a *real* browser: the fixture loads the built `@gridmason/core`
// canvas ESM and the real gridstack, mounts a vanilla test widget from an
// EffectiveLayout, and exposes a small control surface (`window.__gm`) this spec
// drives. The happy-dom unit tests cover the same behavior fast; this asserts it
// holds against a real custom-element registry and a real grid.

/** The control surface the fixture (e2e/fixtures/page-canvas.html) exposes on window. */
interface GmControl {
  resetLog(): void;
  lifecycle(): string[];
  mounted(): readonly string[];
  geometry(i: string): { x: number; y: number; w: number; h: number; i: string } | undefined;
  attrs(i: string): {
    tag: string;
    instanceId: string | null;
    context: string | null;
    settings: string | null;
    editMode: boolean;
    hasSdk: boolean;
  } | null;
  layoutSwap(): void;
  loadTabs(): void;
  activeTab(n: number): void;
  setEditMode(on: boolean): void;
}
type GmWindow = Window & { __gm: GmControl };

test.beforeEach(async ({ page }) => {
  await gotoFixture(page, '/e2e/fixtures/page-canvas.html', '__gm_ready');
});

test('mounts a widget from an EffectiveLayout with the four ABI attrs and the sdk handle', async ({ page }) => {
  const attrs = await page.evaluate(() => (window as unknown as GmWindow).__gm.attrs('w1'));
  expect(attrs).toEqual({
    tag: 'gm-e2e-widget',
    instanceId: 'w1',
    context: '{"record":{"recordType":"customer","id":"42"}}',
    settings: '{"range":"30d"}',
    editMode: false,
    hasSdk: true,
  });
});

test('grid geometry {x,y,w,h,i} round-trips through gridstack', async ({ page }) => {
  const geometry = await page.evaluate(() => (window as unknown as GmWindow).__gm.geometry('w1'));
  expect(geometry).toEqual({ x: 0, y: 0, w: 4, h: 3, i: 'w1' });
});

test('a layout change fires disconnectedCallback before the replacement connects', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm.resetLog());
  await page.evaluate(() => (window as unknown as GmWindow).__gm.layoutSwap());

  const log = await page.evaluate(() => (window as unknown as GmWindow).__gm.lifecycle());
  expect(log).toEqual(['disconnected:gm-e2e-widget:w1', 'connected:gm-e2e-widget:w2']);
  expect(log.indexOf('disconnected:gm-e2e-widget:w1')).toBeLessThan(log.indexOf('connected:gm-e2e-widget:w2'));

  const mounted = await page.evaluate(() => (window as unknown as GmWindow).__gm.mounted());
  expect(mounted).toEqual(['w2']);
});

test('a tab switch fires the old tab disconnect before the new tab connect', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm.loadTabs());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm.mounted())).toEqual(['w1']);

  await page.evaluate(() => (window as unknown as GmWindow).__gm.resetLog());
  await page.evaluate(() => (window as unknown as GmWindow).__gm.activeTab(1));

  const log = await page.evaluate(() => (window as unknown as GmWindow).__gm.lifecycle());
  expect(log).toEqual(['disconnected:gm-e2e-widget:w1', 'connected:gm-e2e-widget:w2']);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm.mounted())).toEqual(['w2']);
});

test('toggling edit mode reflects the edit-mode ABI attribute on the mounted widget', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm.setEditMode(true));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm.attrs('w1')))
    .toMatchObject({ editMode: true });

  await page.evaluate(() => (window as unknown as GmWindow).__gm.setEditMode(false));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm.attrs('w1')))
    .toMatchObject({ editMode: false });
});
