/**
 * `PageCanvas` — the `<gm-page-canvas>` custom element and its ABI (docs/SPEC.md
 * §2, §4). This sub-barrel gathers the gridstack binding ({@link PageCanvas}),
 * the custom-element mount manager ({@link WidgetMountManager}) that upholds the
 * `disconnectedCallback`-before-reuse guarantee, and the widget-ABI surface a
 * widget author targets.
 */
export { CANVAS_GEOMETRY_CHANGE_EVENT, PageCanvas } from './page-canvas.js';
export type { CanvasGeometryChangeDetail, WidgetGeometry } from './page-canvas.js';

export { WidgetMountManager } from './mount-manager.js';
export type { MountedWidget, WidgetMountManagerOptions } from './mount-manager.js';

export {
  ABI_ATTR,
  SDK_HANDLE_PROPERTY,
  applyAbiState,
  applyMountInput,
  assignSdkHandle,
  serializeContext,
  serializeSettings,
} from './abi.js';
export type { WidgetAbiState, WidgetMountInput } from './abi.js';
