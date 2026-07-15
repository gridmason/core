/**
 * The stylesheet for the per-widget error boundary — the skeleton shimmer and
 * the fallback card (docs/SPEC.md §7, FR-10).
 *
 * The boundary renders real DOM (skeletons, cards) and so needs CSS, but
 * `@gridmason/core` ships no separate stylesheet a host must remember to import:
 * the boundary injects a single `<style>` (keyed by {@link BOUNDARY_STYLE_ID})
 * into the document head the first time any boundary mounts, and never again.
 * Everything is scoped under `.gm-widget-boundary` so it cannot bleed into a
 * host's own styles or a widget's shadow-DOM-free markup, and respects
 * `prefers-reduced-motion` (the shimmer is disabled).
 *
 * Every colour is **themeable via CSS custom properties** (a host may override
 * `--gm-fallback-*`, `--gm-retry-*`, and `--gm-skeleton-*` on any ancestor), but
 * the ships-in-the-box defaults are **self-contained and WCAG AA compliant**: the
 * fallback card background is *opaque* so its text/background contrast never
 * depends on what the host renders underneath, and every text pair inside the card
 * (title/bg, message/bg, retry/bg) clears the 4.5:1 AA threshold for normal text.
 * See {@link BOUNDARY_COLORS} for the default palette (asserted in the tests).
 */

/** The class names the boundary DOM uses; shared so markup and CSS agree in one place. */
export const BOUNDARY_CLASS = {
  /** The boundary container wrapping one widget instance (carries `data-gm-state`). */
  root: 'gm-widget-boundary',
  /** The slot the widget custom element is mounted into. */
  slot: 'gm-widget-slot',
  /** The loading skeleton overlay. */
  skeleton: 'gm-widget-skeleton',
  /** One shimmer bar within the skeleton. */
  skeletonBar: 'gm-widget-skeleton__bar',
  /** The error fallback card. */
  fallback: 'gm-widget-fallback',
  /** The fallback card's title (the widget name, or the anonymous label). */
  fallbackTitle: 'gm-widget-fallback__title',
  /** The fallback card's message line. */
  fallbackMessage: 'gm-widget-fallback__message',
  /** The retry control on the fallback card. */
  retry: 'gm-widget-fallback__retry',
  /** Visually-hidden text exposed only to assistive technology. */
  srOnly: 'gm-widget-boundary__sr-only',
} as const;

/** The `data-gm-state` values a boundary root cycles through. */
export const BOUNDARY_STATE = {
  loading: 'loading',
  ready: 'ready',
  error: 'error',
} as const;

/** The `id` of the singleton `<style>` element the boundary injects. */
export const BOUNDARY_STYLE_ID = 'gm-widget-boundary-styles';

/**
 * The default palette baked into {@link STYLE_TEXT} as the fallback values of the
 * boundary's CSS custom properties. A host themes the boundary by overriding the
 * matching `--gm-*` property; absent an override these self-contained defaults
 * apply. The fallback-card text colours are chosen so that, against the *opaque*
 * `fallbackBg`, every text pair clears WCAG AA (4.5:1) for normal text — a
 * property the boundary tests assert over these exact hex values so a regression
 * of a default fails CI. Named after the `--gm-*` property each one backs.
 */
export const BOUNDARY_COLORS = {
  /** `--gm-fallback-bg` — opaque so card contrast never depends on the host backdrop. */
  fallbackBg: '#fef2f2',
  /** `--gm-fallback-border` — decorative card edge (non-text). */
  fallbackBorder: 'rgba(220, 38, 38, 0.4)',
  /** `--gm-fallback-title-color` — ~7:1 on `fallbackBg`. */
  fallbackTitleColor: '#991b1b',
  /** `--gm-fallback-message-color` — ~9:1 on `fallbackBg` (no `opacity` blend). */
  fallbackMessageColor: '#7f1d1d',
  /** `--gm-retry-bg` — opaque button face. */
  retryBg: '#fff',
  /** `--gm-retry-color` — ~7:1 on `retryBg`. */
  retryColor: '#991b1b',
  /** `--gm-retry-border` — decorative button edge (non-text). */
  retryBorder: 'rgba(153, 27, 27, 0.5)',
  /** `--gm-retry-focus-outline` — the `:focus-visible` ring. */
  retryFocusOutline: '#991b1b',
  /** `--gm-skeleton-bg` — the loading overlay wash. */
  skeletonBg: 'rgba(148, 163, 184, 0.12)',
  /** `--gm-skeleton-bar-base` — shimmer bar trough colour. */
  skeletonBarBase: 'rgba(148, 163, 184, 0.18)',
  /** `--gm-skeleton-bar-highlight` — shimmer bar crest colour. */
  skeletonBarHighlight: 'rgba(148, 163, 184, 0.35)',
} as const;

/**
 * The injected stylesheet. Colours are emitted as `var(--gm-*, <default>)` so a
 * host may theme them while the {@link BOUNDARY_COLORS} defaults keep the boundary
 * self-contained and AA-compliant with no host CSS. Exported for the boundary tests
 * (they parse the custom-property defaults back out and assert their contrast).
 */
export const STYLE_TEXT = `
.${BOUNDARY_CLASS.root} {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}
.${BOUNDARY_CLASS.slot} {
  width: 100%;
  height: 100%;
}
/* While loading, the widget slot is present (mounted) but the skeleton overlays it;
   on error the slot is hidden and the fallback card takes over. */
.${BOUNDARY_CLASS.root}[data-gm-state="${BOUNDARY_STATE.error}"] .${BOUNDARY_CLASS.slot} {
  display: none;
}
.${BOUNDARY_CLASS.skeleton} {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--gm-skeleton-bg, ${BOUNDARY_COLORS.skeletonBg});
  overflow: hidden;
}
.${BOUNDARY_CLASS.root}[data-gm-state="${BOUNDARY_STATE.ready}"] .${BOUNDARY_CLASS.skeleton},
.${BOUNDARY_CLASS.root}[data-gm-state="${BOUNDARY_STATE.error}"] .${BOUNDARY_CLASS.skeleton} {
  display: none;
}
.${BOUNDARY_CLASS.skeletonBar} {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--gm-skeleton-bar-base, ${BOUNDARY_COLORS.skeletonBarBase}) 25%,
    var(--gm-skeleton-bar-highlight, ${BOUNDARY_COLORS.skeletonBarHighlight}) 37%,
    var(--gm-skeleton-bar-base, ${BOUNDARY_COLORS.skeletonBarBase}) 63%
  );
  background-size: 400% 100%;
  animation: gm-widget-skeleton-shimmer 1.4s ease infinite;
}
.${BOUNDARY_CLASS.skeletonBar}:first-child { width: 60%; }
.${BOUNDARY_CLASS.skeletonBar}:last-child { width: 90%; }
@keyframes gm-widget-skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .${BOUNDARY_CLASS.skeletonBar} { animation: none; }
}
.${BOUNDARY_CLASS.fallback} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 14px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--gm-fallback-border, ${BOUNDARY_COLORS.fallbackBorder});
  /* Opaque on purpose: a translucent card would inherit the host backdrop and its
     text contrast would stop being deterministic (issue #84). */
  background: var(--gm-fallback-bg, ${BOUNDARY_COLORS.fallbackBg});
  font-family: system-ui, sans-serif;
}
.${BOUNDARY_CLASS.fallbackTitle} {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--gm-fallback-title-color, ${BOUNDARY_COLORS.fallbackTitleColor});
}
.${BOUNDARY_CLASS.fallbackMessage} {
  margin: 0;
  font-size: 12px;
  /* No opacity blend here: fading the text toward the card would drop it below AA. */
  color: var(--gm-fallback-message-color, ${BOUNDARY_COLORS.fallbackMessageColor});
}
.${BOUNDARY_CLASS.retry} {
  margin-top: 2px;
  padding: 4px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--gm-retry-border, ${BOUNDARY_COLORS.retryBorder});
  background: var(--gm-retry-bg, ${BOUNDARY_COLORS.retryBg});
  color: var(--gm-retry-color, ${BOUNDARY_COLORS.retryColor});
}
.${BOUNDARY_CLASS.retry}:focus-visible {
  outline: 2px solid var(--gm-retry-focus-outline, ${BOUNDARY_COLORS.retryFocusOutline});
  outline-offset: 2px;
}
.${BOUNDARY_CLASS.srOnly} {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
`;

/**
 * Ensure the boundary stylesheet is present in `doc`, injecting it once. Keyed by
 * {@link BOUNDARY_STYLE_ID}, so repeated calls (one per mounted widget) are a
 * no-op after the first. A no-op if the document has no `<head>` and no
 * `documentElement` to attach to.
 */
export function ensureBoundaryStyles(doc: Document): void {
  if (doc.getElementById(BOUNDARY_STYLE_ID) !== null) return;
  const parent = doc.head ?? doc.documentElement;
  if (parent === null) return;
  const style = doc.createElement('style');
  style.id = BOUNDARY_STYLE_ID;
  style.textContent = STYLE_TEXT;
  parent.appendChild(style);
}
