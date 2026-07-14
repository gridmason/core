/**
 * The canvas keyboard alternative + a11y layer (docs/SPEC.md §2 `edit-mode`, §7,
 * FR-9): move-mode + arrow-key move/resize, keyboard add/remove/tab paths, widget
 * landmarks, and an ARIA live-region announcer — so the canvas holds WCAG 2.1 AA
 * in edit mode. Every operation drives the **same** {@link EditController} commit
 * path a pointer edit uses; this layer adds only input handling, focus safety,
 * and announcements.
 *
 * Wire it in one call with {@link attachCanvasKeyboardA11y}, or compose the parts
 * ({@link CanvasKeyboardController} + {@link LiveAnnouncer}) directly.
 */
export { LiveAnnouncer } from './announcer.js';
export type { LiveAnnouncerOptions, Politeness } from './announcer.js';

export { CanvasKeyboardController } from './keyboard-controller.js';
export type {
  CanvasKeyboardControllerOptions,
  KeyboardEditCanvas,
  KeyboardEditTarget,
} from './keyboard-controller.js';

export { attachCanvasKeyboardA11y } from './attach.js';
export type {
  A11yCanvas,
  AttachCanvasKeyboardA11yOptions,
  CanvasKeyboardA11y,
} from './attach.js';

export {
  DEFAULT_MIN_SIZE,
  arrowDirection,
  clampRect,
  moveRect,
  resizeRect,
  sameRect,
} from './geometry.js';
export type { GridBounds, MoveDirection } from './geometry.js';

export * as announcements from './announcements.js';
