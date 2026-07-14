/**
 * Anonymous unavailable-widget degradation (docs/SPEC.md §8, §6, FR-13): the
 * engine-side decision that collapses every placed widget an instance cannot
 * render into a single anonymous placeholder, so the canvas renders a generic
 * "unavailable widget" card that echoes **no tag and no name** from the original
 * reference.
 *
 * ## Why the engine anonymizes the identity (no-capability-leakage, §6/§8)
 *
 * An imported layout can reference widgets the current viewer is not entitled to
 * — a dashboard authored by a more-privileged user or another org. Naming such a
 * capability (its tag or display name) would leak that it exists. The per-widget
 * error boundary already renders an *anonymous* card for an unresolved tag, but it
 * attributes its telemetry with the source-qualified `widgetID` — which carries
 * the tag. So the leak-proof boundary is drawn **here, in the engine**: an
 * unavailable instance's identity is rewritten to the shared
 * {@link UNAVAILABLE_WIDGET_ID} placeholder *before* the layout ever reaches the
 * DOM layer, and its `props` / `slot` (which could also describe the missing
 * widget) are dropped. Everything downstream — the mounted element, the fallback
 * card, and every telemetry event — then sees only the placeholder. The DOM-free
 * decision lives here; the card render is the canvas's (SPEC §2).
 *
 * ## Lossless restore
 *
 * This is a pure projection of `(doc, availability)`, not a mutation: it keeps the
 * **original** document (its real identities) untouched. Re-run it whenever the
 * catalog changes (a `catalog:registered` event) and an instance whose widget has
 * since appeared is no longer anonymized — it renders its real widget again. The
 * host holds the original doc and re-derives the render doc; the round-trip is
 * lossless.
 */
import type { LayoutGrid, LayoutPage, LayoutTab, LayoutWidget, WidgetID } from '@gridmason/protocol';

import type { WidgetCatalog } from '../catalog/index.js';

/**
 * The single, shared identity every unavailable instance collapses to. A frozen
 * placeholder that names no real widget: its `tag` is an internal sentinel that is
 * never a registered widget type and never a defined custom element, so the canvas
 * treats it as an unresolved load failure and renders the anonymous card — while
 * DOM and telemetry only ever see this constant, never the original tag (§6/§8).
 */
export const UNAVAILABLE_WIDGET_ID: WidgetID = Object.freeze({
  source: 'gm:unavailable',
  tag: 'gm-unavailable-widget',
});

/**
 * Decides whether a widget identity can be rendered — i.e. this instance has the
 * widget type loaded. Supplied by the host; {@link catalogAvailability} builds one
 * from a {@link WidgetCatalog}.
 */
export type WidgetAvailability = (widgetID: WidgetID) => boolean;

/** The outcome of {@link degradeUnavailableWidgets}. */
export interface DegradeResult {
  /** The layout with every unavailable instance collapsed to {@link UNAVAILABLE_WIDGET_ID}. */
  readonly doc: LayoutPage;
  /**
   * How many instances were degraded to the anonymous placeholder. A bare count —
   * it deliberately carries **no** tag or name, so surfacing "N widgets
   * unavailable" leaks no capability (§8).
   */
  readonly degradedCount: number;
}

/**
 * Build a {@link WidgetAvailability} from a catalog: an instance is renderable
 * only when its **exact** source-qualified identity is registered. Matching on
 * `(source, tag)` together — not the bare tag — is the SPEC §4 rule: a saved
 * instance only ever mounts the widget from the source it was saved with, so a tag
 * bound to a *different* source is unavailable here (and degrades to anonymous),
 * never silently impersonated.
 *
 * @param catalog The widget catalog to consult (only its `has` is used).
 */
export function catalogAvailability(catalog: Pick<WidgetCatalog, 'has'>): WidgetAvailability {
  return (widgetID) => catalog.has(widgetID);
}

/**
 * Project a layout to its renderable form: every placed widget whose identity is
 * not {@link WidgetAvailability available} is replaced by the anonymous
 * {@link UNAVAILABLE_WIDGET_ID} placeholder (its `props` and `slot` dropped),
 * across the single grid and every tab. Pure — the input document is never
 * mutated, so the caller keeps the original for lossless restore.
 *
 * @param doc The (validated, current-version) layout to project.
 * @param isAvailable Whether a given widget identity can be rendered here.
 */
export function degradeUnavailableWidgets(
  doc: LayoutPage,
  isAvailable: WidgetAvailability,
): DegradeResult {
  let degradedCount = 0;

  const projectItem = (item: LayoutWidget): LayoutWidget => {
    if (isAvailable(item.widgetID)) return item;
    degradedCount++;
    // Keep only geometry + the stable key; drop identity, props, and slot so
    // nothing describing the unavailable widget survives into the render doc.
    return { widgetID: UNAVAILABLE_WIDGET_ID, i: item.i, x: item.x, y: item.y, w: item.w, h: item.h };
  };
  const projectGrid = (grid: LayoutGrid): LayoutGrid => ({ items: grid.items.map(projectItem) });

  const grid = projectGrid(doc.grid);
  const tabs = doc.tabs.map((tab: LayoutTab): LayoutTab => ({ name: tab.name, grid: projectGrid(tab.grid) }));

  return { doc: { ...doc, grid, tabs }, degradedCount };
}
