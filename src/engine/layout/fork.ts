/**
 * Copy-on-write fork + reset-to-default per level (docs/SPEC.md §5, FR-5).
 *
 * The three governance levels ({@link ./resolve.js}) are composed by
 * `resolveLayout`; this module owns the two write-side operations FR-5 also
 * mandates:
 *
 * - **Copy-on-write fork.** A user who has no personal layout is *inheriting* —
 *   `resolveLayout` falls through to the org or default level. The first time
 *   they genuinely edit that inherited layout, the engine **forks a personal
 *   copy** at the user level rather than mutating the upstream document. The fork
 *   is a detached snapshot the persistence adapter (C-E4) writes under the user's
 *   {@link ScopeKey}; subsequent edits write to it directly. "Genuinely" is the
 *   crux: fork detection uses the structural diff ({@link ./structural-diff.js}),
 *   never a `JSON.stringify` hash, so reloading and re-serializing an inherited
 *   layout — different key order, whitespace, or item ordering — does not fork.
 * - **Reset-to-default.** Available at every level: {@link resetLevel} drops that
 *   level's personal layout so resolution falls back to the upstream document.
 *   The adapter mirrors this by deleting the level's {@link ScopeKey} entry.
 *
 * Pure and DOM-free (SPEC §2): every operation returns new data and mutates
 * nothing. The persistence adapter interface itself is C-E4; this module defines
 * only the {@link ScopeKey} shape those operations persist under.
 */
import type { LayoutPage } from '@gridmason/protocol';

import type { ResolutionLevel, ResolveLayoutInputs } from './resolve.js';
import { layoutsEqual } from './structural-diff.js';

/**
 * Whose layout a stored document belongs to (SPEC §5): the current user's
 * personal scope, or a named organization scope-node.
 */
export type ScopeOwner = 'user' | { readonly node: string };

/**
 * The persistence key for one stored layout (SPEC §5):
 * `(scope-node | user, pageType, entityId?)`. The bundled and host persistence
 * adapters key `get`/`put` on this (the adapter interface is C-E4); a forked
 * personal copy is stored under, and a reset deletes, the `ScopeKey` for that
 * user, page type, and — when the layout is pinned to one entity — entity.
 */
export interface ScopeKey {
  /** The user or org scope-node the layout belongs to. */
  readonly owner: ScopeOwner;
  /** The page-type id the layout targets (e.g. `crm.customer-detail`). */
  readonly pageType: string;
  /** A specific entity the layout is pinned to, if any. */
  readonly entityId?: string;
}

/**
 * A canonical, order-independent string form of a {@link ScopeKey}, suitable as
 * the key of any KV persistence store. Determined solely by the key's fields, so
 * the same logical scope always maps to the same string.
 */
export function scopeKeyString(key: ScopeKey): string {
  const owner = key.owner === 'user' ? 'user' : `node:${key.owner.node}`;
  const base = `${owner}|${key.pageType}`;
  return key.entityId === undefined ? base : `${base}|${key.entityId}`;
}

/**
 * The outcome of {@link forkOnEdit}: either the edit was structurally a no-op and
 * the user keeps inheriting (`forked: false`), or a detached personal copy was
 * created at the user level (`forked: true`).
 */
export type ForkResult =
  | { readonly forked: false }
  | { readonly forked: true; readonly layout: LayoutPage };

/** A structurally detached deep copy of a layout document. */
export function cloneLayout(layout: LayoutPage): LayoutPage {
  return structuredClone(layout);
}

/**
 * Decide whether a user's edit forks a personal copy (copy-on-write, FR-5).
 *
 * `inherited` is the layout the user was viewing before editing — the resolved
 * effective layout from the levels above them (typically `resolveLayout` over
 * default + org, with no user level). `edited` is the candidate their edit
 * produced. If the two are {@link layoutsEqual} the edit changed nothing that
 * matters and no fork is created — the user keeps inheriting, so later upstream
 * changes still reach them. Otherwise a **detached** personal copy of `edited`
 * is returned to be stored at the user level.
 *
 * The comparison is the structural diff, so a fork is triggered only by a real
 * change to geometry, the item set, props, or tabs — never by reorder-only or
 * whitespace-only serialization differences.
 */
export function forkOnEdit(inherited: LayoutPage, edited: LayoutPage): ForkResult {
  if (layoutsEqual(inherited, edited)) return { forked: false };
  return { forked: true, layout: cloneLayout(edited) };
}

/**
 * Reset a level to default (FR-5): drop that level's personal layout so
 * resolution falls back to the upstream document.
 *
 * Returns new {@link ResolveLayoutInputs} with `level`'s `layout` removed; any
 * `locks` the level contributes are governance the reset leaves intact. If the
 * level supplies no layout to begin with, the inputs are returned unchanged.
 * The persistence adapter (C-E4) mirrors this by deleting the level's
 * {@link ScopeKey} entry.
 */
export function resetLevel(inputs: ResolveLayoutInputs, level: ResolutionLevel): ResolveLayoutInputs {
  const current = inputs[level];
  if (current?.layout === undefined) return inputs;
  // Rebuild the level without `layout` (exactOptionalPropertyTypes forbids
  // assigning `undefined` to it), preserving any locks it declared.
  const reset = current.locks === undefined ? {} : { locks: current.locks };
  return { ...inputs, [level]: reset };
}
