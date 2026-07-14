/**
 * 3-level layout resolution + governance (docs/SPEC.md §5, FR-5).
 *
 * A page's effective layout is composed from up to three candidate layouts, in
 * order of increasing specificity:
 *
 * ```
 * plugin/host default (ships with the page type)
 *   → organization published layout (per org node, per role; may add locks)
 *     → user personal layout (per pageType, optionally per specific entityId)
 * ```
 *
 * Two governance rules bind the composition (SPEC §5):
 *
 * - **Most-specific wins.** The user level overrides the org level, which
 *   overrides the default — on a per-slot / per-item basis. A more-specific
 *   level's version of an item replaces the inherited one; a level that is
 *   silent about an item inherits it unchanged.
 * - **Locked slots merge down.** A slot locked at the default or org level is
 *   fixed for every level below the one that locked it: a lower level's attempt
 *   to move, resize, remove, or replace that slot is ignored, not applied.
 *   Because {@link LayoutWidget.slot} is a stable role id and page-type `locks`
 *   bind to it, the lock follows the instance wherever governance places it.
 *
 * `resolveLayout` is a **pure function**: same inputs → same {@link EffectiveLayout},
 * no mutation of the inputs, and no I/O or DOM access (SPEC §2). Copy-on-write
 * forking and reset-to-default (also FR-5) are the sibling operation (#14); this
 * module is only the merge/lock engine.
 *
 * Each level's `locks` are supplied by the caller: the **default** level's from
 * the page-type descriptor's `locks` (which ship with the page type), the
 * **org** level's from the locks the organization added when it published its
 * layout (SPEC §5). A lock declared at the user level has nothing below it to
 * govern and is ignored.
 */
import type { LayoutPage, LayoutWidget } from '@gridmason/protocol';

/** The three governance levels, least specific to most specific (SPEC §5). */
export type ResolutionLevel = 'default' | 'org' | 'user';

/**
 * One governance level's contribution to resolution: its candidate layout (any
 * level may be absent) and the slots it locks for every level below it.
 */
export interface LayoutLevel {
  /** This level's candidate layout, or `undefined` if the level supplies none. */
  readonly layout?: LayoutPage;
  /**
   * Slot ids this level locks for the levels below it. At the default level
   * these are the page-type descriptor's `locks`; at the org level, the locks
   * the org added on publish. Ignored at the user level (nothing is below it).
   */
  readonly locks?: readonly string[];
}

/**
 * The inputs to {@link resolveLayout}: the three candidate levels. Any level may
 * be omitted; at least one must supply a `layout`.
 */
export interface ResolveLayoutInputs {
  /** Plugin/host default — the layout (and locks) that ship with the page type. */
  readonly default?: LayoutLevel;
  /** Organization published layout, and any locks the org added. */
  readonly org?: LayoutLevel;
  /** User personal layout. Any `locks` here are ignored (nothing is below it). */
  readonly user?: LayoutLevel;
}

/**
 * The resolved layout plus the governance metadata a consumer needs to honor
 * the result: which slots are locked (and so must render non-editable in the
 * canvas edit mode and be respected by resolution-time gating, C-E2/#16).
 */
export interface EffectiveLayout {
  /** The composed, render-ready layout document. */
  readonly layout: LayoutPage;
  /**
   * The slots locked by the default or org level, in first-declared order and
   * de-duplicated. A consumer treats these as fixed: they cannot be moved,
   * resized, removed, or replaced by the user.
   */
  readonly lockedSlots: readonly string[];
}

/** Raised when {@link resolveLayout} is called with no candidate layout at all. */
export class ResolveLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveLayoutError';
  }
}

/** Level indices, ordered least → most specific. */
const DEFAULT_LEVEL = 0;
const ORG_LEVEL = 1;
const USER_LEVEL = 2;

/**
 * The cross-level identity of a placed item: its `slot` (the stable role id
 * governance locks bind to) when it has one, else its grid-item key `i`. Slot
 * and `i` keys live in separate namespaces so a slot value can never collide
 * with an unrelated item's `i`.
 */
function keyOf(item: LayoutWidget): string {
  return item.slot !== undefined ? `slot:${item.slot}` : `i:${item.i}`;
}

/** The slot id a resolution key names, or `undefined` if the key is `i`-based. */
function slotOfKey(key: string): string | undefined {
  return key.startsWith('slot:') ? key.slice('slot:'.length) : undefined;
}

/**
 * The items a layout places in a given grid scope, or `undefined` if it lacks
 * that scope. A scope is the single grid (`''`) or one tab (`tab:<name>`). Item
 * governance composes within matching scopes across levels; the effective
 * layout adopts its container shape (single grid vs. the set and order of tabs)
 * from the most-specific present level.
 */
function itemsInScope(layout: LayoutPage | undefined, scope: string): readonly LayoutWidget[] | undefined {
  if (layout === undefined) return undefined;
  if (layout.hasTabs) {
    const tab = layout.tabs.find((t) => `tab:${t.name}` === scope);
    return tab?.grid.items;
  }
  return scope === '' ? layout.grid.items : undefined;
}

/**
 * Resolve one grid scope: compose its items across the three levels under the
 * two governance rules, returning the effective ordered item list.
 *
 * Ordering: the base (most-specific present) level's items keep their order,
 * each replaced by its resolved winner; items that only survive because an upper
 * level locked them (so a lower base could not remove them) are appended in
 * ascending level then original order.
 */
function resolveScope(
  scope: string,
  layouts: readonly [LayoutPage | undefined, LayoutPage | undefined, LayoutPage | undefined],
  lockLevelOf: (slot: string) => number | undefined,
  baseLevel: number,
): LayoutWidget[] {
  const scopeItems: readonly (readonly LayoutWidget[] | undefined)[] = layouts.map((l) => itemsInScope(l, scope));

  // Gather each item's definition per level, indexed by cross-level key.
  const definitions = new Map<string, (LayoutWidget | undefined)[]>();
  scopeItems.forEach((items, level) => {
    if (items === undefined) return;
    for (const item of items) {
      const key = keyOf(item);
      let byLevel = definitions.get(key);
      if (byLevel === undefined) {
        byLevel = [undefined, undefined, undefined];
        definitions.set(key, byLevel);
      }
      byLevel[level] = item;
    }
  });

  // Pick the winning definition per key: the most-specific level allowed to set
  // it. A slot locked at level L confines the choice to levels at or above L
  // (index <= L); an unlocked item may be set by any level.
  const resolved = new Map<string, { item: LayoutWidget; level: number; index: number }>();
  for (const [key, byLevel] of definitions) {
    const slot = slotOfKey(key);
    const lockLevel = slot !== undefined ? lockLevelOf(slot) : undefined;
    const maxAllowed = lockLevel ?? USER_LEVEL;
    for (let level = maxAllowed; level >= DEFAULT_LEVEL; level--) {
      const item = byLevel[level];
      if (item !== undefined) {
        const index = (scopeItems[level] as readonly LayoutWidget[]).indexOf(item);
        resolved.set(key, { item, level, index });
        break;
      }
    }
    // No allowed level defines this key (e.g. a slot locked at the default level
    // that the default never placed): the item is governed away — omitted.
  }

  // Order: base-level items first, then locked-in survivors from upper levels.
  // The scope was derived from the base layout, so it always defines this scope.
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  const baseItems = scopeItems[baseLevel] as readonly LayoutWidget[];
  for (const item of baseItems) {
    const key = keyOf(item);
    if (resolved.has(key) && !seen.has(key)) {
      orderedKeys.push(key);
      seen.add(key);
    }
  }
  const survivors = [...resolved.entries()]
    .filter(([key]) => !seen.has(key))
    .sort(([, a], [, b]) => (a.level - b.level) || (a.index - b.index))
    .map(([key]) => key);
  orderedKeys.push(...survivors);

  return orderedKeys.map((key) => resolved.get(key)!.item);
}

/** De-duplicated union of the default and org level locks, in first-declared order. */
function effectiveLocks(inputs: ResolveLayoutInputs): string[] {
  const locks: string[] = [];
  const seen = new Set<string>();
  for (const level of [inputs.default, inputs.org]) {
    for (const slot of level?.locks ?? []) {
      if (!seen.has(slot)) {
        seen.add(slot);
        locks.push(slot);
      }
    }
  }
  return locks;
}

/**
 * Resolve a page's effective layout from its up-to-three candidate levels under
 * the SPEC §5 governance rules (most-specific wins; locked slots merge down).
 *
 * Pure and DOM-free: it never mutates the inputs and performs no I/O — the same
 * inputs always produce the same {@link EffectiveLayout}. The result's container
 * shape (single grid vs. the set and order of tabs) is adopted from the
 * most-specific present level; item-level governance is applied within each
 * matching grid scope.
 *
 * @param inputs The default, org, and user levels (any may be absent).
 * @returns The composed layout plus the set of locked slots.
 * @throws {ResolveLayoutError} if no level supplies a layout.
 */
export function resolveLayout(inputs: ResolveLayoutInputs): EffectiveLayout {
  const layouts: [LayoutPage | undefined, LayoutPage | undefined, LayoutPage | undefined] = [
    inputs.default?.layout,
    inputs.org?.layout,
    inputs.user?.layout,
  ];

  // The base is the most-specific level that supplies a layout; it dictates the
  // effective container shape. Its own items are still re-resolved for locks.
  let baseLevel = -1;
  for (let level = USER_LEVEL; level >= DEFAULT_LEVEL; level--) {
    if (layouts[level] !== undefined) {
      baseLevel = level;
      break;
    }
  }
  if (baseLevel === -1) {
    throw new ResolveLayoutError('resolveLayout requires at least one candidate layout');
  }
  const base = layouts[baseLevel] as LayoutPage;

  const defaultLocks = new Set(inputs.default?.locks ?? []);
  const orgLocks = new Set(inputs.org?.locks ?? []);
  const lockLevelOf = (slot: string): number | undefined => {
    if (defaultLocks.has(slot)) return DEFAULT_LEVEL;
    if (orgLocks.has(slot)) return ORG_LEVEL;
    return undefined;
  };

  const layout: LayoutPage = base.hasTabs
    ? {
        ...base,
        tabs: base.tabs.map((tab) => ({
          name: tab.name,
          grid: { items: resolveScope(`tab:${tab.name}`, layouts, lockLevelOf, baseLevel) },
        })),
      }
    : {
        ...base,
        grid: { items: resolveScope('', layouts, lockLevelOf, baseLevel) },
      };

  return { layout, lockedSlots: effectiveLocks(inputs) };
}
