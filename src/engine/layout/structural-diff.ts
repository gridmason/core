/**
 * Structural equality for layout documents (docs/SPEC.md §5, FR-5).
 *
 * Copy-on-write fork detection (see {@link ./fork.js}) asks one question: did the
 * user's edited candidate genuinely differ from the layout they were inheriting?
 * The POC answered it with a `JSON.stringify` hash comparison, which is wrong on
 * two counts — `JSON.stringify` is sensitive to **object key order** and to the
 * accidents of serialization (whitespace, and the order in which a grid's items
 * happen to be emitted). Merely loading and re-serializing an inherited layout
 * could therefore produce a different string and spuriously "fork" a personal
 * copy that then stops tracking upstream changes.
 *
 * This module replaces that hash with a **structural diff**. Two layouts are
 * equal when they describe the same thing — the same container shape, the same
 * set of placed items (by stable key), and the same geometry and props per item
 * — regardless of key order or item ordering. Only a genuine structural change
 * (geometry, item set, props, tabs) counts as an edit. The comparison is pure
 * and DOM-free (SPEC §2).
 */
import type { LayoutGrid, LayoutPage, LayoutTab } from '@gridmason/protocol';

/** Own enumerable keys of `obj` whose value is not `undefined`. */
function definedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((key) => obj[key] !== undefined);
}

/**
 * Deep structural equality, insensitive to object key order.
 *
 * Unlike a `JSON.stringify` comparison this ignores the order in which object
 * keys are written, and treats a key mapped to `undefined` as absent (matching
 * JSON, which drops `undefined`). Arrays are compared position-sensitively;
 * order-insensitive item matching is layered on top in {@link gridsEqual}, which
 * knows a grid's items carry a stable key. Values are compared as plain JSON
 * data — the shape a `LayoutDoc` and its parts always take.
 */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  // Same typeof here. `typeof null === 'object'`, so a lone null (the other side
  // being a non-null object) is caught before the key walk; two nulls already
  // returned true above.
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    return a.every((element, index) => structuralEqual(element, b[index]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = definedKeys(ao);
  const bKeys = definedKeys(bo);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(bo, key) && structuralEqual(ao[key], bo[key]),
  );
}

/**
 * Whether two grids place the same items. Item ordering is **not** significant:
 * a grid item's stable key `i` identifies it, and each item carries its own
 * absolute geometry, so reordering the items array is a serialization accident,
 * not a layout change. Two grids are equal when they hold the same set of keys
 * and each matching pair is {@link structuralEqual} (geometry, props, `widgetID`,
 * `slot`, and `i` all compared).
 */
export function gridsEqual(a: LayoutGrid, b: LayoutGrid): boolean {
  if (a.items.length !== b.items.length) return false;
  const byKey = new Map(a.items.map((item) => [item.i, item] as const));
  // Equal lengths + every b item matching an a item by unique key `i` gives a
  // bijection, so a one-directional walk suffices.
  return b.items.every((item) => {
    const counterpart = byKey.get(item.i);
    return counterpart !== undefined && structuralEqual(counterpart, item);
  });
}

/**
 * Whether two tab sequences are structurally equal. Tabs are compared
 * position-sensitively: a tab bar is user-visible ordered navigation, so
 * reordering or renaming tabs is a genuine change, while each tab's grid is
 * compared order-insensitively by {@link gridsEqual}.
 */
function tabsEqual(a: readonly LayoutTab[], b: readonly LayoutTab[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tab, index) => {
    const other = b[index] as LayoutTab;
    return tab.name === other.name && gridsEqual(tab.grid, other.grid);
  });
}

/**
 * Whether two layout documents are structurally equal for fork detection.
 *
 * Only the load-bearing structure is compared — the container shape (single grid
 * vs. tabs), and within it the items' geometry, set, and props (FR-5's "geometry,
 * item set, props, tabs"). Document **metadata** — `schemaVersion`, `page`,
 * `name`, `default` — is deliberately ignored: a rename or a version bump is not
 * a layout edit and must not fork a personal copy.
 */
export function layoutsEqual(a: LayoutPage, b: LayoutPage): boolean {
  if (a.hasTabs !== b.hasTabs) return false;
  if (a.hasTabs) return tabsEqual(a.tabs, b.tabs);
  return gridsEqual(a.grid, b.grid);
}
