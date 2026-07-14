/**
 * Add-widget picker gating (docs/SPEC.md §6, FR-6): a widget shows only when all
 * four checks hold — `requiresContext` ⊆ page context, `supportsPages` glob
 * matches, gate on, permission held. Core implements the two typed checks and
 * orchestrates the two adapter calls; the same four run again at layout
 * resolution (FR-7, issue #16) via the shared {@link isWidgetEligible} predicate.
 * A widget failing any check is **absent, not greyed** — {@link eligibleWidgets}
 * returns only the widgets that pass, leaking no capability (SPEC §6). Glob
 * matching uses a safe matcher, never `new RegExp(userInput)` (SPEC §8).
 */
export type {
  PickerPageType,
  WidgetGatePort,
  WidgetGatingInput,
  WidgetGatingPorts,
  WidgetGatingQuery,
  WidgetPermissionsPort,
} from './gating.js';
export { eligibleWidgets, isWidgetEligible } from './gating.js';
export { matchAnyGlob, matchGlob } from './safe-glob.js';
