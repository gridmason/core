/**
 * The widget-boundary announcement strings (docs/SPEC.md §7, FR-10) and the sink
 * that speaks them. The per-widget {@link WidgetBoundary} narrates the boundary
 * transitions that a person actually needs to hear — a widget replaced by its
 * error card, an auto-degrade, or a recovery after a retry — to assistive tech
 * through a host-supplied {@link BoundaryAnnounce} sink (typically the same
 * {@link import('../edit-mode/a11y/announcer.js').LiveAnnouncer} the edit-mode
 * a11y layer already uses, so one live region serves both).
 *
 * This mirrors the edit-mode split: the {@link WidgetBoundary} owns the *when*
 * (which transitions announce), this module owns the *what* (the wording, as pure
 * functions a host can wrap for i18n and a test can assert without a DOM), and the
 * sink owns the *how* (writing into a live region).
 *
 * ## What is deliberately silent (avoiding chatter)
 *
 * Only transitions that change what the viewer can *do* are announced. A skeleton
 * appearing and a first-load `skeleton → ready` are **not**: a dashboard of ten
 * widgets settling on load would otherwise fire ten "loaded" messages — noise that
 * trains a screen-reader user to tune the region out. A *recovery* is announced
 * only when it follows a failure the user acted on (a retry), never a first mount.
 *
 * ## No-capability-leakage (SPEC §6/§8)
 *
 * The wording uses only the host-resolved display `name` (via the boundary's
 * descriptor) — the same gated name the fallback card shows. An unattributable
 * widget stays anonymous ("A widget …"); a tag is never echoed into the live
 * region, exactly as it is never echoed onto the card.
 */

/**
 * A sink for user-facing boundary announcements: it receives one already-worded,
 * capability-safe message per meaningful transition and speaks it (a
 * `LiveAnnouncer`, or any `(message) => void`). Optional on the boundary config —
 * with none, the boundary is silent beyond its inline fallback semantics.
 */
export type BoundaryAnnounce = (message: string) => void;

/** The generic subject for a widget the host cannot (or need not) name — never a tag. */
function subjectFor(name: string | undefined): string {
  return name ?? 'A widget';
}

/** A widget fell back to its error card (a load failure, a throw, or a reported error). */
export function widgetUnavailable(name: string | undefined): string {
  return `${subjectFor(name)} is unavailable.`;
}

/** A widget was auto-degraded to its error card after exceeding its latency budget (SPEC §7). */
export function widgetTimedOut(name: string | undefined): string {
  return `${subjectFor(name)} took too long to load and is unavailable.`;
}

/** A widget recovered — it became interactive after a retry of a previously failed instance. */
export function widgetRecovered(name: string | undefined): string {
  return `${subjectFor(name)} loaded.`;
}
