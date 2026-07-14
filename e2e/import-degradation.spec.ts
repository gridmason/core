import { expect, test } from '@playwright/test';

// End-to-end proof of layout import + anonymous unavailable-widget degradation
// (issue #23, FR-13/FR-16) in a *real* browser. The fixture imports a layout that
// references one widget this instance has ('e2e-known') and one untrusted widget
// it does not ('e2e-secret', carrying identifying props + slot). The engine
// degrades the unavailable reference to the anonymous placeholder before it
// reaches the canvas, so the card, the DOM, and the telemetry all stay anonymous —
// then the widget "appears" and the instance restores losslessly.

// The strings from the untrusted entry that must never surface anywhere.
const SECRETS = ['e2e-secret', 'evil.example', 'sekret-value', 'admin-panel'];

interface IoControl {
  state(i: string): string | null;
  mounted(): readonly string[];
  cardTitle(i: string): string | null;
  widgetText(i: string): string | null;
  degradedCount(): number;
  dom(): string;
  telemetryJson(): string;
  restore(): void;
}
type IoWindow = Window & { __io: IoControl; __io_ready?: boolean };

const FIXTURE = '/e2e/fixtures/import-degradation.html';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as unknown as IoWindow).__io_ready === true);
});

test('the available widget mounts and renders while the unavailable one degrades', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.state('w-known'))).toBe('ready');
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.widgetText('w-known'))).toBe('known:w-known');

  // The untrusted reference degraded to exactly one anonymous card.
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.degradedCount())).toBe(1);
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.state('w-secret'))).toBe('error');
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.cardTitle('w-secret'))).toBe(
    'Unavailable widget',
  );
});

test('no tag/name/props from the unavailable widget echo into the DOM', async ({ page }) => {
  const dom = await page.evaluate(() => (window as unknown as IoWindow).__io.dom());
  for (const secret of SECRETS) expect(dom).not.toContain(secret);
});

test('no tag/name/props from the unavailable widget echo into telemetry', async ({ page }) => {
  const telemetry = await page.evaluate(() => (window as unknown as IoWindow).__io.telemetryJson());
  for (const secret of SECRETS) expect(telemetry).not.toContain(secret);
  // What telemetry *does* carry for the degraded instance is only the anonymous
  // placeholder identity — never the real tag.
  expect(telemetry).toContain('gm-unavailable-widget');
});

test('the instance restores losslessly when the widget appears', async ({ page }) => {
  await page.evaluate(() => (window as unknown as IoWindow).__io.restore());

  await expect
    .poll(() => page.evaluate(() => (window as unknown as IoWindow).__io.state('w-secret')))
    .toBe('ready');
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.widgetText('w-secret'))).toBe('secret:w-secret');
  expect(await page.evaluate(() => (window as unknown as IoWindow).__io.degradedCount())).toBe(0);
});
