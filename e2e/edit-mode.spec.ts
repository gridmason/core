import { expect, test } from '@playwright/test';

import { gotoFixture } from './support/harness.js';

// End-to-end proof of edit mode (issue #18, FR-9) in a *real* browser: the
// fixture builds the built `@gridmason/core` canvas + an EditController with an
// in-memory persistence double, and exposes a control surface (`window.__gm_edit`)
// this spec drives. Each operation — drag, resize, add, remove, tabs — is
// asserted to persist through the adapter (the double's stored doc reflects it),
// plus the copy-on-write fork and locked-slot governance the operations honor.

interface StoredItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The control surface the fixture (e2e/fixtures/edit-mode.html) exposes on window. */
interface GmEdit {
  loadDefault(): void;
  loadLocked(): void;
  loadTabbed(): void;
  addWidget(): string;
  removeWidget(i: string): boolean;
  addTab(name: string): void;
  renameTab(idx: number, name: string): void;
  switchTab(idx: number): void;
  eligibleTags(): string[];
  canRemove(i: string): boolean;
  isLocked(i: string): boolean;
  forked(): boolean;
  puts(): number;
  storedDoc(): unknown;
  storedItems(): StoredItem[] | undefined;
  storedTabItems(idx: number): string[] | undefined;
  storedTabs(): string[] | undefined;
  mounted(): readonly string[];
  lifecycle(): string[];
  resetLog(): void;
}
type GmWindow = Window & { __gm_edit: GmEdit };

test.beforeEach(async ({ page }) => {
  await gotoFixture(page, '/e2e/fixtures/edit-mode.html', '__gm_ready');
});

test('add: the picker lists only gated-in widgets, and adding places + persists', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadDefault());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.eligibleTags())).toEqual([
    'gm-e2e-widget',
  ]); // gm-gated absent

  const newId = await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.addWidget());
  const items = await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedItems());
  expect(items?.map((it) => it.i)).toContain(newId);
  // First-fit places the new 3-wide item beside w1 (which occupies x0..2).
  expect(items?.find((it) => it.i === newId)).toMatchObject({ x: 3, y: 0 });
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.mounted())).toContain(newId);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.forked())).toBe(true);
});

test('remove: tearing an instance down fires disconnect and persists the removal', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadDefault());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.resetLog());

  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.removeWidget('w1'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedItems())).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.lifecycle())).toContain('disconnected:w1');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.mounted())).not.toContain('w1');
});

test('drag: a pointer move persists the new geometry through the adapter', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadDefault());
  const target = page.locator('.grid-stack-item:has(gm-e2e-widget[instance-id="w1"]) > .grid-stack-item-content');
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const b = box!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 350, b.y + b.height / 2 + 150, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_edit.puts())).toBeGreaterThan(0);
  const moved = await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedItems());
  const w1 = moved?.find((it) => it.i === 'w1');
  expect(w1).toBeDefined();
  expect(w1!.x + w1!.y).toBeGreaterThan(0); // it moved from the origin
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.forked())).toBe(true);
});

test('resize: dragging the resize handle persists the new size', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadDefault());
  const itemSel = '.grid-stack-item:has(gm-e2e-widget[instance-id="w1"])';
  await page.locator(itemSel).hover();
  const handle = page.locator(`${itemSel} .ui-resizable-se`);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const b = box!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 250, b.y + b.height / 2 + 150, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_edit.puts())).toBeGreaterThan(0);
  const sized = await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedItems());
  const w1 = sized?.find((it) => it.i === 'w1');
  expect(w1).toBeDefined();
  expect(w1!.w + w1!.h).toBeGreaterThan(3 + 2); // it grew from 3×2
});

test('tabs: create, switch, add-into, and rename all persist', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadTabbed());

  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.addTab('Details'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedTabs())).toEqual([
    'Overview',
    'Details',
  ]);

  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.switchTab(1));
  const newId = await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.addWidget());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedTabItems(1))).toContain(newId);

  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.renameTab(0, 'Renamed'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedTabs())).toEqual([
    'Renamed',
    'Details',
  ]);
});

test('fork: the inherited layout is untouched until the first genuine edit', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadDefault());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.forked())).toBe(false);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedDoc())).toBeUndefined(); // inheriting

  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.addWidget());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.forked())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.storedDoc())).toBeDefined();
});

test('locked slot: no resize handle, no remove affordance, and removal is refused', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.loadLocked());

  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.isLocked('locked'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.canRemove('locked'))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.canRemove('free'))).toBe(true);

  // The locked item exposes no resize handle; the free one does.
  const lockedHandles = page.locator('.grid-stack-item:has(gm-e2e-widget[instance-id="locked"]) .ui-resizable-se');
  const freeHandles = page.locator('.grid-stack-item:has(gm-e2e-widget[instance-id="free"]) .ui-resizable-se');
  await expect(lockedHandles).toHaveCount(0);
  await expect(freeHandles).toHaveCount(1);

  // Removal of the locked slot is refused and nothing is persisted.
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.removeWidget('locked'))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_edit.puts())).toBe(0);
});
