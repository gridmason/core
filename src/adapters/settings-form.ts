/**
 * Settings-form adapter (docs/SPEC.md §2, §4, FR-12).
 *
 * A widget may register its own settings element; when it does not, the host
 * renders a **fallback settings form driven by the widget's JSON schema** (the
 * manifest's `props` schema) in the host's own design system (SPEC §4). Core
 * owns neither the schema-to-UI mapping nor the design system, so it delegates
 * to this host adapter — the engine layer never touches the DOM (SPEC §2); this
 * is host/canvas-layer code.
 *
 * Core hands the adapter the widget identity, the JSON schema, the current
 * settings value, a mount point, and an `onChange` callback; the adapter renders
 * the form and returns a {@link SettingsFormHandle} core uses to push external
 * updates and to tear the form down on unmount.
 */
import type { WidgetID } from '@gridmason/protocol';

/**
 * A JSON Schema object (draft-agnostic) — the parsed contents of a widget
 * manifest's `props` schema. Structural on purpose: core passes it through to
 * the host renderer opaquely and does not itself interpret or validate it.
 */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** Everything the host needs to render one widget instance's settings form. */
export interface SettingsFormRequest {
  /** The source-qualified widget whose settings are being edited. */
  readonly widget: WidgetID;
  /** The layout id (`LayoutWidget.i`) of the instance being configured. */
  readonly instanceId: string;
  /** The widget's JSON-schema'd props definition (manifest `props`). */
  readonly schema: JsonSchema;
  /** The instance's current settings (persisted per-instance props). */
  readonly value: unknown;
  /** Host-owned element the form mounts into. */
  readonly container: Element;
  /**
   * Called with the next settings whenever the user makes a valid edit. Core
   * persists the result through the {@link PersistenceAdapter}; the adapter must
   * not persist directly.
   */
  onChange(next: unknown): void;
}

/** A live settings form the host has mounted, controlled by core. */
export interface SettingsFormHandle {
  /**
   * Replace the form's value with externally-changed settings (e.g. a reset or a
   * governance push) without re-mounting. Does not re-fire `onChange`.
   */
  update(value: unknown): void;
  /**
   * Unmount the form and release everything it allocated. Core calls this before
   * the instance is removed or re-mounted (SPEC §4 lifecycle guarantee).
   */
  destroy(): void;
}

/**
 * The host settings-form adapter: renders the JSON-schema fallback settings form
 * in the host's design system and returns a handle core drives. Interface only —
 * core ships no renderer and no design-system-coupled UI.
 */
export interface SettingsFormAdapter {
  /** Render the fallback settings form for one widget instance. */
  render(request: SettingsFormRequest): SettingsFormHandle;
}
