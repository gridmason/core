import { expect, test } from 'vitest';

import { BOUNDARY_COLORS, STYLE_TEXT } from './styles.js';

// The fallback card ships opaque, self-contained colours so its text contrast is
// deterministic and WCAG AA compliant with zero host CSS (issue #84 — the dashboard
// Lighthouse a11y=1.0 gate). These tests read the custom-property *defaults* straight
// out of the injected stylesheet and recompute WCAG contrast over the exact hex the
// boundary paints, so regressing a default (or reintroducing the translucent bg /
// message `opacity`) fails CI rather than only Lighthouse downstream.

/** One SRGB channel byte → its linear-light value (WCAG 2.1). */
function linearize(byte: number): number {
  const s = byte / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance of a `#rgb` or `#rrggbb` colour (SRGB → linear). */
function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) throw new Error(`not a hex colour: ${hex}`);
  const body = m[1] ?? '';
  const full = body.length === 3 ? body.replace(/./g, '$&$&') : body;
  const int = Number.parseInt(full, 16);
  return (
    0.2126 * linearize((int >> 16) & 0xff) +
    0.7152 * linearize((int >> 8) & 0xff) +
    0.0722 * linearize(int & 0xff)
  );
}

/** WCAG contrast ratio between two `#rrggbb` colours (1:1 … 21:1). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Extract the default value of `var(--<prop>, <default>)` as it ships in STYLE_TEXT. */
function shippedDefault(prop: string): string {
  const m = new RegExp(String.raw`var\(--${prop},\s*([^)]+)\)`).exec(STYLE_TEXT);
  if (m === null || m[1] === undefined) throw new Error(`no var(--${prop}, …) in STYLE_TEXT`);
  return m[1].trim();
}

const AA_NORMAL_TEXT = 4.5;

// The three text/background pairs a reader actually sees on the fallback card.
const pairs = [
  { name: 'title on card', fg: 'gm-fallback-title-color', bg: 'gm-fallback-bg' },
  { name: 'message on card', fg: 'gm-fallback-message-color', bg: 'gm-fallback-bg' },
  { name: 'retry label on button', fg: 'gm-retry-color', bg: 'gm-retry-bg' },
] as const;

test.each(pairs)('$name meets WCAG AA (≥ 4.5:1) at the shipped defaults', ({ fg, bg }) => {
  const ratio = contrastRatio(shippedDefault(fg), shippedDefault(bg));
  expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
});

test('the shipped custom-property defaults match the exported palette', () => {
  expect(shippedDefault('gm-fallback-bg')).toBe(BOUNDARY_COLORS.fallbackBg);
  expect(shippedDefault('gm-fallback-title-color')).toBe(BOUNDARY_COLORS.fallbackTitleColor);
  expect(shippedDefault('gm-fallback-message-color')).toBe(BOUNDARY_COLORS.fallbackMessageColor);
  expect(shippedDefault('gm-retry-color')).toBe(BOUNDARY_COLORS.retryColor);
  expect(shippedDefault('gm-retry-bg')).toBe(BOUNDARY_COLORS.retryBg);
});

test('the fallback card background is opaque (no host-dependent contrast)', () => {
  // A hex (or any non-rgba/hsla) value; specifically not the old rgba(...,0.6).
  expect(BOUNDARY_COLORS.fallbackBg).toMatch(/^#[0-9a-f]{6}$/i);
});

test('the fallback message no longer uses opacity to blend its text', () => {
  const messageBlock = /\.gm-widget-fallback__message\s*\{([^}]*)\}/.exec(STYLE_TEXT);
  expect(messageBlock).not.toBeNull();
  expect(messageBlock![1]).not.toMatch(/opacity\s*:/);
});
