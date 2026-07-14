/**
 * The loading skeleton a slow widget shows until it becomes interactive
 * (docs/SPEC.md §7, FR-10). The canvas **never blocks on widget code**: a widget
 * that declares itself pending gets this placeholder immediately while it loads,
 * and the rest of the canvas stays interactive.
 *
 * Accessibility (FR-9, WCAG 2.1 AA): the shimmer bars are purely decorative and
 * `aria-hidden`; the boundary marks the region `aria-busy` and this component
 * carries a visually-hidden `role="status"` line ("Loading <name>…") so assistive
 * technology announces the pending state without exposing the decorative bars.
 */
import { BOUNDARY_CLASS } from './styles.js';

/** How many decorative shimmer bars the skeleton renders. */
const SKELETON_BARS = 2;

/**
 * Build a loading-skeleton element for a widget whose display name is `name`
 * (or a generic "widget" when unnamed). The returned element is decorative
 * (`aria-hidden` bars) plus one visually-hidden `role="status"` announcement.
 */
export function createSkeleton(doc: Document, name: string | undefined): HTMLElement {
  const skeleton = doc.createElement('div');
  skeleton.className = BOUNDARY_CLASS.skeleton;

  const bars = doc.createElement('div');
  bars.setAttribute('aria-hidden', 'true');
  bars.style.display = 'contents';
  for (let i = 0; i < SKELETON_BARS; i += 1) {
    const bar = doc.createElement('div');
    bar.className = BOUNDARY_CLASS.skeletonBar;
    bars.appendChild(bar);
  }
  skeleton.appendChild(bars);

  const status = doc.createElement('span');
  status.className = BOUNDARY_CLASS.srOnly;
  status.setAttribute('role', 'status');
  status.textContent = `Loading ${name ?? 'widget'}…`;
  skeleton.appendChild(status);

  return skeleton;
}
