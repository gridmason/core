/**
 * Resolution-time gating: the four checks of docs/SPEC.md §6 applied to a
 * page's *persisted* widget instances (FR-7).
 *
 * The add-widget picker (FR-6) decides which widget *types* a viewer may add;
 * the same four checks — `requiresContext` ⊆ page context, `supportsPages` glob,
 * gate on, permission held — must run again when a **saved** layout is resolved
 * for render, because governance can change after a layout is stored. A persisted
 * instance whose gate is now off, whose data permission was revoked, or whose
 * page context/`supportsPages` no longer matches is **silently omitted** from the
 * effective layout (SPEC §6):
 *
 * - **No named placeholder.** An omitted instance leaves no card, name, slot
 *   marker, or reason behind — emitting one would leak the existence of a
 *   capability the viewer is not entitled to see (SPEC §6 no-capability-leakage).
 * - **The saved layout is untouched.** Omission is a *view-time filter*, never a
 *   write: {@link gateResolvedLayout} builds a new {@link EffectiveLayout} and
 *   mutates nothing, so the persisted `LayoutDoc` still carries the instance.
 *   When the gate is turned back on (or the permission restored), the next
 *   resolution includes the instance again — a clean, lossless round-trip (FR-7).
 *
 * This reuses the single {@link isWidgetEligible} predicate the picker exports —
 * the checks are never duplicated. It is engine-layer and DOM-free, and makes no
 * network calls: gate and permission state arrive through the same adapter ports
 * the picker uses (SPEC §1), and a persisted instance's manifest is resolved
 * through a caller-supplied {@link WidgetManifestSource}.
 *
 * A **load failure** of an entitled widget is explicitly *not* handled here: an
 * instance whose type the host cannot resolve (not loaded / unknown) is **kept**,
 * so the canvas can render the C-E3 error-boundary fallback card for it. Only a
 * *gated-off or unpermitted* instance is omitted; dropping an unresolved type
 * would suppress that fallback and conflate the two cases (SPEC §6).
 */
import type { LayoutPage, LayoutWidget, Manifest, WidgetID } from '@gridmason/protocol';

import { isWidgetEligible } from '../picker/gating.js';
import type { PickerPageType, WidgetGatingPorts } from '../picker/gating.js';

import type { EffectiveLayout } from './resolve.js';
import { resolveLayout } from './resolve.js';
import type { ResolveLayoutInputs } from './resolve.js';

/**
 * Resolves a persisted instance's manifest from its source-qualified identity.
 * The manifest is check 1/2's source of `requiresContext`/`supportsPages` and
 * carries the `capabilities` the gate/permission ports key on.
 *
 * A {@link WidgetCatalog} adapts to this directly:
 * `{ manifestFor: (id) => catalog.get(id)?.manifest }`. Returning `undefined`
 * signals the type is not loaded — the instance is a **load failure**, kept for
 * the C-E3 fallback card rather than silently omitted (SPEC §6).
 */
export interface WidgetManifestSource {
  /** The manifest registered for a widget identity, or `undefined` if unknown. */
  manifestFor(widgetID: WidgetID): Manifest | undefined;
}

/**
 * Everything {@link gateResolvedLayout} needs to gate one page's instances: the
 * page being resolved against, a manifest source, and the same gate/permission
 * ports the picker consumes ({@link WidgetGatingPorts}).
 */
export interface ResolutionGatingContext extends WidgetGatingPorts {
  /** The page type the layout is being resolved for (checks 1 and 2). */
  readonly pageType: PickerPageType;
  /** Resolves each persisted instance's identity to its manifest (checks 1–4). */
  readonly manifests: WidgetManifestSource;
}

/**
 * Whether a persisted instance survives resolution-time gating. An instance whose
 * type is unresolved is a load failure and is **kept** (C-E3 fallback, not silent
 * omission); a resolved instance runs the shared four-check {@link isWidgetEligible}.
 */
function instanceEligible(item: LayoutWidget, context: ResolutionGatingContext): boolean {
  const manifest = context.manifests.manifestFor(item.widgetID);
  if (manifest === undefined) return true;
  return isWidgetEligible({
    manifest,
    widget: item.widgetID,
    pageType: context.pageType,
    gates: context.gates,
    permissions: context.permissions,
  });
}

/** A grid whose ineligible instances have been dropped, preserving item order. */
function gateItems(items: readonly LayoutWidget[], context: ResolutionGatingContext): readonly LayoutWidget[] {
  return items.filter((item) => instanceEligible(item, context));
}

/**
 * Apply resolution-time gating to an already-resolved {@link EffectiveLayout},
 * silently omitting every persisted instance that now fails the four checks
 * (SPEC §6, FR-7).
 *
 * Non-destructive and pure: the input `effective` and its `layout` are never
 * mutated — a **new** {@link EffectiveLayout} is returned with ineligible
 * instances filtered out of every grid (single-grid or per-tab). The container
 * shape (single grid vs. the set and order of tabs) and the `lockedSlots`
 * governance metadata are carried through unchanged; gating removes widget
 * instances, not the page's structure or its lock policy. A tab that loses all
 * its widgets is retained as an empty tab — the tab set is governance's to
 * decide (SPEC §5), not gating's.
 *
 * @param effective The governance-resolved layout to gate (see {@link resolveLayout}).
 * @param context The page, manifest source, and gate/permission ports.
 * @returns A new effective layout with gated-off/unpermitted instances omitted.
 */
export function gateResolvedLayout(effective: EffectiveLayout, context: ResolutionGatingContext): EffectiveLayout {
  const { layout } = effective;
  const gated: LayoutPage = layout.hasTabs
    ? {
        ...layout,
        tabs: layout.tabs.map((tab) => ({
          name: tab.name,
          grid: { items: gateItems(tab.grid.items, context) },
        })),
      }
    : {
        ...layout,
        grid: { items: gateItems(layout.grid.items, context) },
      };

  return { layout: gated, lockedSlots: effective.lockedSlots };
}

/**
 * The integrated resolution pipeline: compose the up-to-three governance levels
 * ({@link resolveLayout}) and then apply resolution-time gating
 * ({@link gateResolvedLayout}) in one call (FR-5 + FR-7).
 *
 * Pure and DOM-free, with no network calls (SPEC §1, §2): governance first
 * decides *which* placement of each item wins, then gating decides which of the
 * surviving instances the viewer may see. The saved layout is never mutated.
 *
 * @param inputs The default/org/user candidate levels (see {@link ResolveLayoutInputs}).
 * @param context The page, manifest source, and gate/permission ports.
 * @returns The governed, gated effective layout.
 * @throws {import('./resolve.js').ResolveLayoutError} if no level supplies a layout.
 */
export function resolveAndGateLayout(
  inputs: ResolveLayoutInputs,
  context: ResolutionGatingContext,
): EffectiveLayout {
  return gateResolvedLayout(resolveLayout(inputs), context);
}
