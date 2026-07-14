/**
 * The stylesheet for the per-widget error boundary — the skeleton shimmer and
 * the fallback card (docs/SPEC.md §7, FR-10).
 *
 * The boundary renders real DOM (skeletons, cards) and so needs CSS, but
 * `@gridmason/core` ships no separate stylesheet a host must remember to import:
 * the boundary injects a single `<style>` (keyed by {@link BOUNDARY_STYLE_ID})
 * into the document head the first time any boundary mounts, and never again.
 * Everything is scoped under `.gm-widget-boundary` so it cannot bleed into a
 * host's own styles or a widget's shadow-DOM-free markup. Colours use CSS system
 * colours / neutral values and respect `prefers-reduced-motion` (the shimmer is
 * disabled) — no theming dependency.
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

const STYLE_TEXT = `
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
  background: rgba(148, 163, 184, 0.12);
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
    rgba(148, 163, 184, 0.18) 25%,
    rgba(148, 163, 184, 0.35) 37%,
    rgba(148, 163, 184, 0.18) 63%
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
  border: 1px solid rgba(220, 38, 38, 0.4);
  background: rgba(254, 242, 242, 0.6);
  font-family: system-ui, sans-serif;
}
.${BOUNDARY_CLASS.fallbackTitle} {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #991b1b;
}
.${BOUNDARY_CLASS.fallbackMessage} {
  margin: 0;
  font-size: 12px;
  color: #7f1d1d;
  opacity: 0.85;
}
.${BOUNDARY_CLASS.retry} {
  margin-top: 2px;
  padding: 4px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid rgba(153, 27, 27, 0.5);
  background: #fff;
  color: #991b1b;
}
.${BOUNDARY_CLASS.retry}:focus-visible {
  outline: 2px solid #991b1b;
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
