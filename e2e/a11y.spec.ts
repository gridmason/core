import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { gotoFixture } from './support/harness.js';

// End-to-end proof of the canvas keyboard alternative + a11y layer (issue #19,
// FR-9) in a real browser. The fixture builds the built `@gridmason/core` canvas
// + an EditController + the keyboard/a11y controller (attachCanvasKeyboardA11y)
// and exposes a control surface (`window.__gm_a11y`). This spec:
//   - runs axe in edit mode and asserts no WCAG 2.1 AA violations,
//   - drives a widget's move + resize with the keyboard **only** (no mouse) and
//     asserts the geometry persists through the adapter,
//   - asserts every operation is narrated through the ARIA live region,
//   - asserts focus is never stranded on a detached node across remove + tab
//     switch.

interface StoredItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The control surface the fixture (e2e/fixtures/a11y.html) exposes on window. */
interface GmA11y {
  loadDefault(): void;
  loadLocked(): void;
  loadTabbed(): void;
  loadVirtualized(): void;
  loadBoundary(): void;
  boundaryState(i: string): string | null;
  resolveSlow(): void;
  setFlakyOk(): void;
  retryBoundary(i: string): void;
  scrollToItem(i: string): void;
  landmark(i: string): { instance: string | null; tabindex: string | null } | null;
  add(): string;
  remove(i: string): boolean;
  focus(i: string): void;
  switchTab(i: number, name?: string): void;
  live(): string;
  inMoveMode(): boolean;
  focused(): string | undefined;
  activeInstance(): string | null;
  activeConnected(): boolean;
  puts(): number;
  forked(): boolean;
  storedItems(): StoredItem[] | undefined;
  storedTabItems(idx: number): string[] | undefined;
  mounted(): readonly string[];
}
type GmWindow = Window & { __gm_a11y: GmA11y };

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.beforeEach(async ({ page }) => {
  await gotoFixture(page, '/e2e/fixtures/a11y.html', '__gm_ready');
});

test('axe: the canvas has no WCAG 2.1 AA violations in edit mode', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadDefault());
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});

test('keyboard-only: move-mode + arrow keys move and resize a widget, and it persists', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadDefault());

  // Focus the first widget with the keyboard alone — no mouse.
  for (let i = 0; i < 5 && (await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())) !== 'w1'; i += 1) {
    await page.keyboard.press('Tab');
  }
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w1');

  await page.keyboard.press('Enter'); // enter move-mode
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.inMoveMode())).toBe(true);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight'); // resize wider

  await expect.poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.puts())).toBeGreaterThan(0);
  const w1 = await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.storedItems()?.find((it) => it.i === 'w1'));
  // Started at (0,0,3,2): two rights + one down + one shift-right (widen).
  expect(w1).toMatchObject({ x: 2, y: 1, w: 4, h: 2 });
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.forked())).toBe(true);

  // Focus stayed on the moved widget throughout the keyboard interaction.
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w1');
});

test('announcements: move, resize, add, remove, and tab switch all speak through the live region', async ({
  page,
}) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadDefault());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.focus('w1'));

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toContain('move mode');

  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toMatch(/Moved to column \d+, row \d+\./);

  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toMatch(/Resized to .* tall\./);

  await page.keyboard.press('Escape'); // leave move-mode

  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.add());
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toBe('Clock added.');

  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.remove('w2'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toBe('Widget Two removed.');

  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadTabbed());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.switchTab(1, 'Details'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toBe('Switched to Details tab.');
});

test('focus is preserved (not lost to a detached node) when the focused widget is removed', async ({
  page,
}) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadDefault());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.focus('w1'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w1');

  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.remove('w1'));

  // Focus moved to the surviving widget — never left on the detached node or body.
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeConnected())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w2');
});

test('virtualize + a11y: a widget mounted lazily on scroll gains a landmark and is Tab-reachable', async ({
  page,
}) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadVirtualized());

  // w1 (near the top) mounts once the IntersectionObserver settles and the a11y
  // layer landmarks it. w3 is placed far down the page: poll until it has settled
  // as *not* mounted (a virtualized offscreen item), which — landmark tracking
  // mount state — means it carries no keyboard landmark.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.mounted().includes('w1')))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.mounted().includes('w3')))
    .toBe(false);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.landmark('w3'))).toEqual({
    instance: null,
    tabindex: null,
  });

  // Scroll w3 into view → the virtualizer mounts it → the a11y layer landmarks it.
  // This is the regression: before the fix a lazily-mounted widget never became a
  // landmark (mountedInstanceIds was empty at render time and no mount event fired).
  // Re-assert the scroll each poll: the IntersectionObserver mounts asynchronously
  // and gridstack positions items with transforms, so one scrollIntoView may not
  // land w3 in the band — keep scrolling to it until it mounts.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a11y = (window as unknown as GmWindow).__gm_a11y;
        a11y.scrollToItem('w3');
        return a11y.mounted().includes('w3');
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.landmark('w3')?.instance))
    .toBe('w3');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.landmark('w3'))).toEqual({
    instance: 'w3',
    tabindex: '0',
  });

  // Tab-reachable: w2 sits just above w3 and co-mounts with it (both centred in
  // view), so tabbing forward from the now-mounted w2 reaches w3 — proving the
  // freshly-landmarked widget is in the sequential tab order. Tab forward until we
  // land on it (gridstack interleaves a focusable `.grid-stack-item-content` scroll
  // container between items, so w3 is a couple of tab stops past w2, not exactly one).
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.mounted().includes('w2')))
    .toBe(true);
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.focus('w2'));
  let reachedW3 = false;
  for (let step = 0; step < 5 && !reachedW3; step += 1) {
    await page.keyboard.press('Tab');
    reachedW3 = await page.evaluate(
      () => (window as unknown as GmWindow).__gm_a11y.activeInstance() === 'w3',
    );
  }
  expect(reachedW3).toBe(true);
});

test('boundary announcements: an error card and a post-retry recovery speak through the live region; a plain skeleton→ready does not (issue #55)', async ({
  page,
}) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadBoundary());

  // The crashing widget fell back to its card; the slow widget shows a skeleton.
  // (These initial transitions are silent — the sink is wired after the first mount.)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.boundaryState('crash1')))
    .toBe('error');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.boundaryState('slow1')))
    .toBe('loading');

  // Chatter check: a slow widget that never failed becoming ready announces
  // NOTHING — the live region stays empty (no skeleton→ready narration).
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.resolveSlow());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.boundaryState('slow1')))
    .toBe('ready');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live())).toBe('');

  // Error announcement: retrying the always-crashing widget re-enters the error
  // state and announces it, by its resolved name, through the shared live region.
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.retryBoundary('crash1'));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live()))
    .toBe('Revenue Chart is unavailable.');

  // Recovery announcement: fix the flaky widget, retry → it becomes interactive
  // and the recovery (error → ready) is announced.
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.setFlakyOk());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.retryBoundary('flaky1'));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.boundaryState('flaky1')))
    .toBe('ready');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.live()))
    .toBe('Sales Chart loaded.');
});

test('focus is preserved across a tab switch that unmounts the focused widget', async ({ page }) => {
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.loadTabbed());
  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.focus('w1'));
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w1');

  await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.switchTab(1, 'Details'));

  // w1 (Overview) unmounted; focus lands on the new tab's widget, still connected.
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeConnected())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.activeInstance())).toBe('w2');
  expect(await page.evaluate(() => (window as unknown as GmWindow).__gm_a11y.mounted())).toEqual(['w2']);
});
