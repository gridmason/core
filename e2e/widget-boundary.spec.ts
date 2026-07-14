import { expect, test } from '@playwright/test';

// End-to-end proof of the per-widget error boundary (issue #20, FR-10) in a
// *real* browser. The fixture mounts a mixed grid — a healthy, a slow, a
// crashing, and an unavailable widget — through the built `@gridmason/core`
// canvas. Two things this asserts that the happy-dom unit tests cannot: a
// crashing widget's `connectedCallback` throw is reported to the window `error`
// event (not propagated) in Chromium and must still be caught, and the skeleton /
// fallback DOM renders against a real gridstack.

interface BndControl {
  state(i: string): string | null;
  mounted(): readonly string[];
  hasCard(i: string): boolean;
  cardTitle(i: string): string | null;
  cardText(i: string): string | null;
  hasRetry(i: string): boolean;
  skeletonStatus(i: string): string | null;
  widgetText(i: string): string | null;
  telemetry(): Array<Record<string, unknown>>;
  resolveSlow(): void;
  retry(i: string): void;
}
type BndWindow = Window & { __bnd: BndControl; __bnd_ready?: boolean };

const FIXTURE = '/e2e/fixtures/widget-boundary.html';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as unknown as BndWindow).__bnd_ready === true);
});

test('a crashing widget renders a named fallback card with a retry; siblings are unaffected', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-crash'))).toBe('error');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.hasCard('w-crash'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.cardTitle('w-crash'))).toBe('Revenue Chart');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.hasRetry('w-crash'))).toBe(true);

  // The healthy sibling mounted and is interactive despite the crash next to it.
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-ok'))).toBe('ready');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.widgetText('w-ok'))).toBe('ok:w-ok');
});

test('a slow widget shows a skeleton while the canvas stays interactive, then reveals on ready', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-slow'))).toBe('loading');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.skeletonStatus('w-slow'))).toContain('Loading');
  // The rest of the canvas is live while the slow widget loads — it did not block.
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-ok'))).toBe('ready');

  await page.evaluate(() => (window as unknown as BndWindow).__bnd.resolveSlow());

  await expect
    .poll(() => page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-slow')))
    .toBe('ready');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.widgetText('w-slow'))).toBe('slow-ready');
});

test('the telemetry port receives per-widget error and latency attribution', async ({ page }) => {
  const telemetry = await page.evaluate(() => (window as unknown as BndWindow).__bnd.telemetry());

  // Error attribution for the crash, carrying the source-qualified identity.
  expect(telemetry).toContainEqual(
    expect.objectContaining({
      type: 'widget.error',
      reason: 'threw',
      instanceId: 'w-crash',
      widgetID: { source: 'local', tag: 'gm-e2e-crash' },
    }),
  );
  // Latency attribution for the healthy widget settling.
  expect(telemetry).toContainEqual(
    expect.objectContaining({ type: 'widget.latency', phase: 'settled', instanceId: 'w-ok' }),
  );
});

test('an unavailable (never-defined) tag is an anonymous card with no tag/name echo', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('w-missing'))).toBe('error');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.cardTitle('w-missing'))).toBe(
    'Unavailable widget',
  );
  const text = await page.evaluate(() => (window as unknown as BndWindow).__bnd.cardText('w-missing'));
  expect(text).not.toContain('gm-e2e-missing');
});

test('a gated-off instance (absent from the layout) has no boundary and no card', async ({ page }) => {
  // The engine omits gated-off instances from the effective layout, so the canvas
  // never mounts one — no boundary, no card, no telemetry (SPEC §6, no leakage).
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.mounted())).not.toContain('gated-off');
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.state('gated-off'))).toBeNull();
  expect(await page.evaluate(() => (window as unknown as BndWindow).__bnd.hasCard('gated-off'))).toBe(false);
});
