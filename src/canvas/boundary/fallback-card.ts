/**
 * The per-widget error **fallback card** (docs/SPEC.md §7, §6/§8, FR-10). When
 * an entitled widget throws or fails to load, the boundary replaces it with this
 * card so its siblings and the rest of the canvas are unaffected — one widget's
 * failure never takes the page down.
 *
 * ## Naming and the no-capability-leakage rule (SPEC §6/§8)
 *
 * The card shows a widget **name** only when the host's descriptor resolver
 * supplies one — i.e. for a widget the viewer is **entitled** to and the host can
 * attribute. When no name is available (an unknown/unresolved tag), the card is
 * **anonymous** ("Unavailable widget") and echoes **no tag or name**: naming a
 * capability the viewer is not entitled to see would leak it (§8 mirrors §6's
 * rule for gated-off widgets, which are omitted entirely and never reach a card).
 *
 * ## Accessibility (FR-9, WCAG 2.1 AA)
 *
 * The card is a `role="group"` labelled by its title, with a `role="alert"`
 * message so a screen reader announces the failure, and a real, focusable
 * `<button>` retry. The card root is `tabindex="-1"` so the boundary can move
 * focus to it programmatically after a user-initiated retry fails, keeping the
 * keyboard user oriented (the boundary owns *when* to focus; this builds the DOM).
 *
 * The inline `role="alert"` is the baseline announcement. When the boundary is
 * wired to a persistent live-region announcer ({@link CreateFallbackCardOptions.announced}),
 * it is dropped: the region speaks the failure reliably, and keeping both would
 * announce it twice on screen readers that voice inserted alerts.
 */
import { BOUNDARY_CLASS } from './styles.js';
import type { WidgetFailureReason } from './telemetry.js';

/** The label shown when no display name can be attributed (SPEC §8 — no tag/name echo). */
const ANONYMOUS_LABEL = 'Unavailable widget';

/** The DOM handles the boundary needs from a built fallback card. */
export interface FallbackCard {
  /** The card root, to insert into the boundary and (optionally) focus. */
  readonly root: HTMLElement;
  /** The retry button, so the boundary can wire its click and manage focus. */
  readonly retry: HTMLButtonElement;
}

/** Options for {@link createFallbackCard}. */
export interface CreateFallbackCardOptions {
  /**
   * Whether a persistent live-region announcer will speak this failure. When
   * `true`, the card's inline `role="alert"` is omitted so the failure is not
   * announced twice (the region is the single, reliable channel). Default `false`.
   */
  readonly announced?: boolean;
}

/** The user-facing message for a failure, given the (optional) resolved name. */
function messageFor(reason: WidgetFailureReason, name: string | undefined): string {
  const subject = name ?? 'This widget';
  switch (reason) {
    case 'unresolved':
      return `${name ?? 'This widget'} is unavailable.`;
    case 'timeout':
      return `${subject} is taking too long to load.`;
    case 'threw':
    case 'reported':
      return `${subject} ran into a problem.`;
  }
}

/**
 * Build a fallback card for a failed widget: a titled, alerting card with a retry
 * button. `name` is the host-resolved display name, or `undefined` for the
 * anonymous card (no tag/name echoed, per SPEC §6/§8). The caller wires
 * `retry.onclick` and decides focus.
 */
export function createFallbackCard(
  doc: Document,
  reason: WidgetFailureReason,
  name: string | undefined,
  options: CreateFallbackCardOptions = {},
): FallbackCard {
  const title = name ?? ANONYMOUS_LABEL;

  const root = doc.createElement('div');
  root.className = BOUNDARY_CLASS.fallback;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', title);
  root.tabIndex = -1;

  const heading = doc.createElement('p');
  heading.className = BOUNDARY_CLASS.fallbackTitle;
  heading.textContent = title;
  root.appendChild(heading);

  const message = doc.createElement('p');
  message.className = BOUNDARY_CLASS.fallbackMessage;
  // Kept as the baseline announcement, unless a live-region announcer covers it.
  if (options.announced !== true) message.setAttribute('role', 'alert');
  message.textContent = messageFor(reason, name);
  root.appendChild(message);

  const retry = doc.createElement('button');
  retry.className = BOUNDARY_CLASS.retry;
  retry.type = 'button';
  retry.textContent = 'Retry';
  root.appendChild(retry);

  return { root, retry };
}
