/**
 * Permissions adapter (docs/SPEC.md §2, §6, FR-12) — governance check 4 of the
 * picker.
 *
 * A widget is eligible for a page only when, among the four §6 checks, the
 * current user **holds the data permissions** the widget's capabilities require.
 * That is host authz state, answered through an adapter — core makes zero
 * network calls (SPEC §1) and never resolves a permission itself.
 *
 * This is the **canonical superset** of the minimal {@link WidgetPermissionsPort}
 * the picker (issue #15) and resolution-time gating (issue #16) already depend
 * on: `PermissionsAdapter` *is* that port under the adapter surface's name, so
 * the same host object satisfies both and the two are never duplicated.
 */
import type { WidgetPermissionsPort } from '../engine/picker/gating.js';

export type { WidgetPermissionsPort, WidgetGatingQuery } from '../engine/picker/gating.js';

/**
 * The host permissions adapter: answers whether the current user holds the data
 * permissions a widget's capabilities require, from in-memory authz state.
 * Aliases {@link WidgetPermissionsPort} (`hasPermissions(query) => boolean`) —
 * the same contract under the adapter surface's name, so the adapter set reads
 * uniformly and a host object satisfies both.
 */
export type PermissionsAdapter = WidgetPermissionsPort;
