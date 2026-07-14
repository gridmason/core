/**
 * The one-call wiring for the canvas keyboard/a11y layer (docs/SPEC.md §7, FR-9):
 * builds a {@link LiveAnnouncer} scoped to the canvas and a
 * {@link CanvasKeyboardController} over it, and returns a handle that disposes
 * both. A host that wants the keyboard alternative + announcements on a
 * {@link PageCanvas} driven by an {@link EditController} calls this once after
 * constructing the controller.
 */
import { LiveAnnouncer } from './announcer.js';
import type { Politeness } from './announcer.js';
import { CanvasKeyboardController } from './keyboard-controller.js';
import type {
  CanvasKeyboardControllerOptions,
  KeyboardEditCanvas,
  KeyboardEditTarget,
} from './keyboard-controller.js';

/** A canvas that is also an `HTMLElement`, so the live region can be scoped inside it. */
export type A11yCanvas = KeyboardEditCanvas & HTMLElement;

/** Options for {@link attachCanvasKeyboardA11y} — the controller options minus the pieces it builds. */
export interface AttachCanvasKeyboardA11yOptions
  extends Omit<CanvasKeyboardControllerOptions, 'canvas' | 'controller' | 'announcer'> {
  /** Live-region politeness (default `polite`). */
  readonly politeness?: Politeness;
}

/** The disposable handle {@link attachCanvasKeyboardA11y} returns. */
export interface CanvasKeyboardA11y {
  /** The keyboard/a11y controller, for programmatic `focus`/`add`/`remove`/tab calls. */
  readonly controller: CanvasKeyboardController;
  /** The live announcer, for a host that wants to speak its own messages. */
  readonly announcer: LiveAnnouncer;
  /** Detach the keyboard listeners and remove the live region. */
  dispose(): void;
}

/**
 * Attach the keyboard alternative + a11y announcements to a canvas driven by an
 * edit controller. Creates a canvas-scoped live region and a
 * {@link CanvasKeyboardController}; call {@link CanvasKeyboardA11y.dispose} to
 * tear both down when the edit session ends.
 */
export function attachCanvasKeyboardA11y(
  canvas: A11yCanvas,
  editController: KeyboardEditTarget,
  options: AttachCanvasKeyboardA11yOptions = {},
): CanvasKeyboardA11y {
  const announcer = new LiveAnnouncer({
    container: canvas,
    ...(options.politeness !== undefined ? { politeness: options.politeness } : {}),
  });
  const controller = new CanvasKeyboardController({
    canvas,
    controller: editController,
    announcer,
    ...options,
  });
  return {
    controller,
    announcer,
    dispose(): void {
      controller.dispose();
      announcer.dispose();
    },
  };
}
