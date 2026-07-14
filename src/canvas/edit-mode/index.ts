/**
 * Edit mode (docs/SPEC.md §2 `edit-mode`, FR-9): the canvas-layer authoring loop
 * over a {@link PageCanvas} — drag, resize, add, remove, and tab authoring. The
 * {@link EditController} wires the canvas to the headless engine (first-fit
 * placement, picker gating, copy-on-write fork) and persists each edit through a
 * {@link LayoutPersistencePort}, honoring locked slots. The pure
 * layout-transform {@link operations} it is built on are exported for hosts that
 * want to compute an edited document without the controller.
 *
 * The keyboard alternative + a11y announcements (#19), the per-widget error
 * boundary (#20), and virtualization + debounced writes (#21) are sibling C-E3
 * concerns that layer on this.
 */
export {
  DEFAULT_WIDGET_SIZE,
  EditController,
} from './edit-controller.js';
export type {
  AddWidgetInput,
  EditableCanvas,
  EditControllerOptions,
  EditControllerPicker,
  LayoutPersistencePort,
} from './edit-controller.js';

export {
  activeGridItems,
  addTab,
  addWidget,
  applyGeometry,
  findActiveItem,
  isItemLocked,
  removeWidget,
  renameTab,
  withActiveGridItems,
} from './operations.js';
