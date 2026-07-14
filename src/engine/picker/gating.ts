/**
 * Add-widget picker gating: the four checks of docs/SPEC.md §6, FR-6.
 *
 * A widget is eligible for a page only when **all four** hold:
 * 1. `requiresContext` ⊆ page context — a typed subset check;
 * 2. `supportsPages` glob matches the page-type id — via the {@link matchAnyGlob}
 *    safe matcher, never `new RegExp(userInput)` (SPEC §8);
 * 3. the widget's governance gate is on — a {@link WidgetGatePort} call;
 * 4. the user holds the widget's declared data permissions — a
 *    {@link WidgetPermissionsPort} call.
 *
 * Core owns checks 1–2 (pure, in-engine) and orchestrates 3–4 through minimal
 * adapter ports the host implements — core itself makes zero network calls
 * (SPEC §1). The **same four checks run again at layout resolution** (FR-7,
 * issue #16), so {@link isWidgetEligible} is exported as the single reusable
 * predicate both callers share.
 *
 * Absent-not-greyed (SPEC §6): {@link eligibleWidgets} returns only the widgets
 * that pass — a widget failing any check (including a gate or permission) is
 * **omitted entirely**, never returned with a disabled marker or reason, so the
 * result leaks no capability the viewer is not entitled to see.
 */
import type { Capability, ContextMap, ContextType, Manifest, WidgetID } from '@gridmason/protocol';
import { isContextSubset } from '@gridmason/protocol';

import type { WidgetCatalogEntry } from '../catalog/index.js';

import { matchAnyGlob } from './safe-glob.js';

/**
 * The page a widget is being gated against: its id (the glob target for check 2)
 * and the full typed context it provides (the subset target for check 1). A
 * {@link RegisteredPageType} from the page-type registry satisfies this shape
 * structurally, so callers pass one directly.
 */
export interface PickerPageType {
  /** Page-type id, e.g. `crm.customer-detail` — matched by `supportsPages`. */
  readonly id: string;
  /** Typed context the page provides, keyed by slot — matched by `requiresContext`. */
  readonly context: ContextMap;
}

/**
 * The query passed to the gate and permission ports for one widget/page pair.
 * Uniform across both ports so a host can key its lookups off one shape; the
 * full adapter interfaces (C-E4, issue #22) accept this or a superset.
 */
export interface WidgetGatingQuery {
  /** Source-qualified identity of the widget being gated. */
  readonly widget: WidgetID;
  /** Id of the page type the widget would be placed on (governance scope). */
  readonly pageTypeId: string;
  /** The widget's manifest-declared capabilities (empty when it declares none). */
  readonly capabilities: readonly Capability[];
}

/**
 * Minimal gates port (check 3). The full gates adapter (C-E4) is a superset; the
 * picker depends only on this predicate. A host answers from in-memory
 * governance state — core never calls the network to resolve a gate.
 */
export interface WidgetGatePort {
  /** Whether the widget's governance gate is currently on for this page. */
  isGateOn(query: WidgetGatingQuery): boolean;
}

/**
 * Minimal permissions port (check 4). The full permissions adapter (C-E4) is a
 * superset. A host answers whether the current user holds the data permissions
 * the widget's capabilities require, from in-memory state.
 */
export interface WidgetPermissionsPort {
  /** Whether the current user holds the widget's declared data permissions. */
  hasPermissions(query: WidgetGatingQuery): boolean;
}

/** The gate and permission ports orchestrated for checks 3 and 4. */
export interface WidgetGatingPorts {
  readonly gates: WidgetGatePort;
  readonly permissions: WidgetPermissionsPort;
}

/** Everything {@link isWidgetEligible} needs to evaluate one widget for one page. */
export interface WidgetGatingInput extends WidgetGatingPorts {
  /** The widget's manifest — source of `requiresContext`, `supportsPages`, `capabilities`. */
  readonly manifest: Manifest;
  /** The widget's source-qualified identity, passed to the gate/permission ports. */
  readonly widget: WidgetID;
  /** The page being gated against. */
  readonly pageType: PickerPageType;
}

/**
 * Check 1 — `requiresContext` ⊆ page context. The manifest's `requiresContext`
 * is the lossy `{ recordType? }`-per-slot shorthand (SPEC §3): a slot naming a
 * `recordType` is a `record-ref` requirement matched by the protocol's
 * {@link isContextSubset}; a slot without one is a **presence-only** requirement
 * (the page must declare that key, of any type). A widget with no
 * `requiresContext` requires nothing and passes.
 */
function requiredContextSatisfied(requiresContext: Manifest['requiresContext'], pageContext: ContextMap): boolean {
  if (requiresContext === undefined) return true;
  const typed: Record<string, ContextType> = {};
  for (const [slot, requirement] of Object.entries(requiresContext)) {
    if (!Object.hasOwn(pageContext, slot)) return false;
    if (requirement.recordType !== undefined) {
      typed[slot] = { type: 'record-ref', recordType: requirement.recordType };
    }
  }
  return isContextSubset(typed, pageContext);
}

/**
 * Check 2 — `supportsPages` glob matches the page-type id, via the safe matcher.
 * An **omitted** `supportsPages` is no page restriction (the widget is
 * placeable anywhere its context is satisfied); a **present** list must match
 * the page id via at least one glob (an empty list therefore admits no page).
 */
function supportsPageType(supportsPages: Manifest['supportsPages'], pageTypeId: string): boolean {
  if (supportsPages === undefined) return true;
  return matchAnyGlob(supportsPages, pageTypeId);
}

/**
 * Evaluate all four gating checks for one widget on one page (SPEC §6, FR-6).
 * Returns `true` only when every check passes. Checks run in order and
 * short-circuit, so the gate/permission ports are not consulted for a widget the
 * page's context or `supportsPages` already excludes.
 *
 * This is the single predicate the add-widget picker (FR-6) and layout
 * resolution (FR-7, issue #16) share. It returns a bare boolean by design: the
 * *reason* a widget failed is never surfaced, so no caller can accidentally leak
 * a gated-off or unpermitted widget's existence (SPEC §6 no-capability-leakage).
 */
export function isWidgetEligible(input: WidgetGatingInput): boolean {
  const { manifest, widget, pageType, gates, permissions } = input;

  if (!requiredContextSatisfied(manifest.requiresContext, pageType.context)) return false;
  if (!supportsPageType(manifest.supportsPages, pageType.id)) return false;

  const query: WidgetGatingQuery = {
    widget,
    pageTypeId: pageType.id,
    capabilities: manifest.capabilities ?? [],
  };
  if (!gates.isGateOn(query)) return false;
  if (!permissions.hasPermissions(query)) return false;

  return true;
}

/**
 * The widgets eligible for the add-widget picker on `pageType`: every catalog
 * entry that passes all four checks of {@link isWidgetEligible}, in the input
 * order. Enforces the absent-not-greyed rule structurally — a widget failing any
 * check (context, `supportsPages`, gate, or permission) is simply absent from the
 * result, carrying no entry, tag, name, or reason. The returned data is DOM-free;
 * the canvas picker (C-E3) renders it.
 */
export function eligibleWidgets(
  entries: Iterable<WidgetCatalogEntry>,
  pageType: PickerPageType,
  ports: WidgetGatingPorts,
): WidgetCatalogEntry[] {
  const eligible: WidgetCatalogEntry[] = [];
  for (const entry of entries) {
    if (isWidgetEligible({ manifest: entry.manifest, widget: entry.id, pageType, ...ports })) {
      eligible.push(entry);
    }
  }
  return eligible;
}
