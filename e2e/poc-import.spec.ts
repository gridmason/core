import { expect, test } from '@playwright/test';

// End-to-end proof of the POC importer (issue #24, FR-14) in a *real* browser: a
// checked-in `s7k-widgets-core` localStorage dump is imported, resolved onto a
// demo page type, and rendered on the canvas. The host has two of the dump's
// widgets ('acme-clock', 'acme-notes') and not the third ('acme-market-ticker'),
// which degrades to the anonymous unavailable-widget card rather than crashing —
// with no tag/name/props from the missing widget echoing into the DOM or telemetry.

// The three grid items' stable keys, from fixtures/s7k-widgets-core/dashboard-export.json.
const CLOCK = 'c1f0a2b3-0001-4a00-8000-000000000001';
const NOTES = 'c1f0a2b3-0002-4a00-8000-000000000002';
const TICKER = 'c1f0a2b3-0003-4a00-8000-000000000003';

// Strings that identify the missing widget and must never surface anywhere.
const SECRETS = ['acme-market-ticker', 'Market Ticker', 'ACME', 'WIDG'];

interface PocControl {
  importOk(): boolean;
  pageIds(): readonly string[];
  degradedCount(): number;
  instanceIds(): readonly string[];
  state(i: string): string | null;
  cardTitle(i: string): string | null;
  widgetText(i: string): string | null;
  dom(): string;
  telemetryJson(): string;
}
type PocWindow = Window & { __poc: PocControl; __poc_ready?: boolean };

const FIXTURE = '/e2e/fixtures/poc-import.html';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as unknown as PocWindow).__poc_ready === true);
});

test('the real POC dump imports into both pages', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as PocWindow).__poc.importOk())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as PocWindow).__poc.pageIds())).toEqual(['index', 'reports']);
});

test('the host-known widgets mount and render on the demo page type', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as PocWindow).__poc.instanceIds())).toEqual([
    CLOCK,
    NOTES,
    TICKER,
  ]);
  expect(await page.evaluate((i) => (window as unknown as PocWindow).__poc.state(i), CLOCK)).toBe('ready');
  expect(await page.evaluate((i) => (window as unknown as PocWindow).__poc.widgetText(i), CLOCK)).toBe(
    'clock:' + CLOCK,
  );
  expect(await page.evaluate((i) => (window as unknown as PocWindow).__poc.widgetText(i), NOTES)).toBe(
    'notes:' + NOTES,
  );
});

test('the POC widget with no catalog match degrades to the anonymous card, not a crash', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as PocWindow).__poc.degradedCount())).toBe(1);
  expect(await page.evaluate((i) => (window as unknown as PocWindow).__poc.state(i), TICKER)).toBe('error');
  expect(await page.evaluate((i) => (window as unknown as PocWindow).__poc.cardTitle(i), TICKER)).toBe(
    'Unavailable widget',
  );
});

test('no tag/name/props from the missing widget echo into the DOM', async ({ page }) => {
  const dom = await page.evaluate(() => (window as unknown as PocWindow).__poc.dom());
  for (const secret of SECRETS) expect(dom).not.toContain(secret);
});

test('no tag/name/props from the missing widget echo into telemetry', async ({ page }) => {
  const telemetry = await page.evaluate(() => (window as unknown as PocWindow).__poc.telemetryJson());
  for (const secret of SECRETS) expect(telemetry).not.toContain(secret);
  // What telemetry *does* carry for the degraded instance is only the anonymous
  // placeholder identity — never the real POC tag.
  expect(telemetry).toContain('gm-unavailable-widget');
});
