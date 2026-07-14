/**
 * The widget ABI — the contract between the canvas and every mounted widget
 * custom element (docs/SPEC.md §4, FR-8).
 *
 * A widget is a custom element the *host* has already registered; the canvas
 * mounts it and drives it through four **attributes in** and one **opaque
 * property**:
 *
 * - `context` — the serialized typed page-context value the page provides
 *   (JSON). Every widget on a page receives the same context (SPEC §3).
 * - `settings` — the widget instance's saved props (JSON), from the layout
 *   item's `props`.
 * - `instance-id` — the layout's stable grid-item key (the layout item's `i`).
 * - `edit-mode` — a boolean attribute: **present** while the canvas is in edit
 *   mode, **absent** otherwise (no value is significant — presence is the signal).
 * - the host **SDK handle** — supplied at mount on the element's
 *   {@link SDK_HANDLE_PROPERTY} property. The canvas **never inspects it**; it is
 *   a pass-through from the shell to the widget (interface in `@gridmason/sdk`).
 *
 * `context` and `settings` are serialized to attribute *strings* because that is
 * the custom-element attribute contract; the SDK handle is an object and so
 * travels as a property, not an attribute. This module owns the attribute names
 * and the (de)serialization, so the mount manager and `PageCanvas` share one
 * definition of the ABI and a widget author reads it in one place.
 */

/**
 * The four ABI attribute names the canvas sets on a mounted widget (SPEC §4).
 * Widgets list these in `observedAttributes` to react to context / settings /
 * edit-mode changes without being re-mounted.
 */
export const ABI_ATTR = {
  /** Serialized typed page-context value (JSON). */
  context: 'context',
  /** Serialized per-instance saved props (JSON). */
  settings: 'settings',
  /** Stable grid-item key of the instance. */
  instanceId: 'instance-id',
  /** Boolean attribute — present iff the canvas is in edit mode. */
  editMode: 'edit-mode',
} as const;

/**
 * The property name on a mounted widget element that carries the **opaque** host
 * SDK handle (SPEC §4). The canvas assigns the shell-supplied handle here at
 * mount and never reads it back; the widget reads `element.sdk` to obtain its
 * SDK. It is a property (not an attribute) because the handle is a live object.
 */
export const SDK_HANDLE_PROPERTY = 'sdk';

/**
 * The mutable slice of a widget's ABI — the three attribute-carried inputs the
 * canvas may update *in place* on a live widget (without a re-mount): the page
 * context, the instance settings, and the edit-mode flag. `instance-id` and the
 * SDK handle are fixed for a widget's lifetime and so are not part of this.
 */
export interface WidgetAbiState {
  /** The typed page-context value; serialized to the `context` attribute. */
  readonly context: unknown;
  /** The instance's saved props; serialized to the `settings` attribute. */
  readonly settings: Readonly<Record<string, unknown>> | undefined;
  /** Whether the canvas is in edit mode; reflected as the `edit-mode` boolean attribute. */
  readonly editMode: boolean;
}

/**
 * Everything needed to mount one widget instance: its custom-element `tag` and
 * `instanceId` (both fixed for the instance's lifetime), the opaque `sdk` handle,
 * and the mutable {@link WidgetAbiState}.
 */
export interface WidgetMountInput extends WidgetAbiState {
  /** The custom-element tag to mount (the layout item's `widgetID.tag`). */
  readonly tag: string;
  /** The stable grid-item key, set as the `instance-id` attribute. */
  readonly instanceId: string;
  /** The opaque host SDK handle, assigned to {@link SDK_HANDLE_PROPERTY}. Never inspected. */
  readonly sdk: unknown;
}

/**
 * Serialize a page-context value to its `context` attribute string. Always
 * returns valid JSON: a context that cannot be serialized (e.g. it contains a
 * cycle) degrades to `"null"` rather than throwing, so one bad context can never
 * crash the canvas mount (SPEC §7 — the canvas never blocks on widget/host data).
 */
export function serializeContext(context: unknown): string {
  try {
    return JSON.stringify(context ?? null) ?? 'null';
  } catch {
    return 'null';
  }
}

/**
 * Serialize an instance's saved props to its `settings` attribute string. A
 * widget with no saved props receives `"{}"`. Unserializable props degrade to
 * `"{}"` (see {@link serializeContext}).
 */
export function serializeSettings(settings: Readonly<Record<string, unknown>> | undefined): string {
  try {
    return JSON.stringify(settings ?? {}) ?? '{}';
  } catch {
    return '{}';
  }
}

/**
 * Reflect a {@link WidgetAbiState} onto a mounted widget element: set `context`
 * and `settings` (serialized) and add/remove the `edit-mode` boolean attribute.
 * Used both at mount and for in-place updates (edit-mode toggle, context change)
 * that must **not** trigger a re-mount.
 */
export function applyAbiState(element: Element, state: WidgetAbiState): void {
  element.setAttribute(ABI_ATTR.context, serializeContext(state.context));
  element.setAttribute(ABI_ATTR.settings, serializeSettings(state.settings));
  if (state.editMode) {
    element.setAttribute(ABI_ATTR.editMode, '');
  } else {
    element.removeAttribute(ABI_ATTR.editMode);
  }
}

/**
 * Set the fixed-for-lifetime ABI on a freshly created widget element — the
 * `instance-id` attribute and the opaque SDK-handle property — then the mutable
 * {@link WidgetAbiState}. Called once, **before** the element is inserted into
 * the DOM, so the widget's `connectedCallback` observes a fully-configured
 * element (attributes and SDK handle both present).
 */
export function applyMountInput(element: Element, input: WidgetMountInput): void {
  element.setAttribute(ABI_ATTR.instanceId, input.instanceId);
  assignSdkHandle(element, input.sdk);
  applyAbiState(element, input);
}

/**
 * Assign the opaque host SDK handle to the element's {@link SDK_HANDLE_PROPERTY}.
 * The value is stored verbatim and never read by the canvas.
 */
export function assignSdkHandle(element: Element, sdk: unknown): void {
  (element as unknown as Record<string, unknown>)[SDK_HANDLE_PROPERTY] = sdk;
}
