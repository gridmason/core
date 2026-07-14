/**
 * Gates adapter (docs/SPEC.md §2, §6, FR-12) — governance check 3 of the picker.
 *
 * A widget is eligible for a page only when, among the four §6 checks, its
 * **governance gate is on**. Whether a gate is on is host governance state, so
 * it is answered through an adapter — core makes zero network calls (SPEC §1)
 * and never resolves a gate itself.
 *
 * This is the **canonical superset** of the minimal {@link WidgetGatePort} the
 * picker (issue #15) and resolution-time gating (issue #16) already depend on:
 * `GatesAdapter` *is* that port under the adapter surface's name, so the same
 * host object satisfies both and the two are never duplicated. The engine keeps
 * consuming the narrow {@link WidgetGatePort}; a host implements `GatesAdapter`
 * and passes it wherever a `WidgetGatePort` is expected.
 */
import type { WidgetGatePort } from '../engine/picker/gating.js';

export type { WidgetGatePort, WidgetGatingQuery } from '../engine/picker/gating.js';

/**
 * The host gates adapter: answers whether a widget's governance gate is on for a
 * given page, from in-memory governance state. Aliases {@link WidgetGatePort}
 * (`isGateOn(query) => boolean`) — the same contract under the adapter surface's
 * name, so the adapter set reads uniformly and a host object satisfies both.
 */
export type GatesAdapter = WidgetGatePort;
