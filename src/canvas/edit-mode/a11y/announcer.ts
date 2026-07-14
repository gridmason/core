/**
 * The ARIA live-region announcer (docs/SPEC.md §7, FR-9): a visually-hidden,
 * screen-reader-only region whose text is updated to narrate each edit-mode
 * operation. It is the one DOM primitive of the a11y layer; the
 * {@link CanvasKeyboardController} owns the *when* and the {@link announcements}
 * module owns the *what*, and this owns the *how* — a persistent
 * `role="status"` (`aria-live="polite"`) node that assistive tech observes.
 *
 * "Visually hidden" here means clipped to a 1px box, **not** `display:none` or
 * `visibility:hidden` — those would drop it from the accessibility tree and
 * silence it. It stays in the tree, so nothing shows on screen yet every
 * announcement is spoken.
 */

/** Politeness of the live region: `polite` waits for a pause, `assertive` interrupts. */
export type Politeness = 'polite' | 'assertive';

/** Options for constructing a {@link LiveAnnouncer}. */
export interface LiveAnnouncerOptions {
  /**
   * The element the live region is appended into (and removed from on
   * {@link LiveAnnouncer.dispose}). Defaults to the owning document's `<body>`,
   * so the region persists for the page; a host may scope it to the canvas.
   */
  readonly container?: HTMLElement;
  /**
   * The document used to create the region. Defaults to `container`'s document,
   * else the ambient `document`. Injectable so a test (or an `<iframe>`-hosted
   * canvas) can supply its own.
   */
  readonly ownerDocument?: Document;
  /** Live-region politeness (default `polite`). */
  readonly politeness?: Politeness;
}

/** Inline styles that hide an element visually while keeping it in the accessibility tree. */
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;border:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

/**
 * A persistent ARIA live region. Construct one per canvas edit session; call
 * {@link announce} to speak a message and {@link dispose} to remove the node.
 */
export class LiveAnnouncer {
  readonly #region: HTMLElement;

  constructor(options: LiveAnnouncerOptions = {}) {
    const doc = options.ownerDocument ?? options.container?.ownerDocument ?? document;
    const region = doc.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', options.politeness ?? 'polite');
    // Read the whole message atomically, not just the changed part.
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('data-gm-live-region', '');
    region.setAttribute('style', VISUALLY_HIDDEN);
    (options.container ?? doc.body).appendChild(region);
    this.#region = region;
  }

  /** The live-region element, for tests and hosts that need to place or inspect it. */
  get element(): HTMLElement {
    return this.#region;
  }

  /** The text currently in the region (the last message announced). */
  get message(): string {
    return this.#region.textContent ?? '';
  }

  /**
   * Announce `message`: replace the region's text so assistive tech speaks it.
   * An empty string clears the region.
   */
  announce(message: string): void {
    this.#region.textContent = message;
  }

  /** Remove the live region from the DOM. Call when the edit session ends. */
  dispose(): void {
    this.#region.remove();
  }
}
