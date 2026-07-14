/**
 * Layout export (docs/SPEC.md §8, FR-13): serialize the current effective /
 * persisted `LayoutDoc` to schema-valid JSON text. The inverse of
 * {@link importLayout} — {@link importLayout}`(`{@link exportLayout}`(doc))`
 * round-trips a valid document back to an equal one.
 *
 * Export is a pure serialization: it takes an already-typed {@link LayoutPage}
 * (the store hands out valid documents by construction) and stringifies it. It
 * makes no network call and reads no ambient state (SPEC §1, §8).
 */
import type { LayoutPage } from '@gridmason/protocol';

/**
 * Serialize a `LayoutDoc` to indented JSON text, ready to hand a user to save or
 * copy. The output parses back through {@link importLayout} to an equal document.
 *
 * @param doc The layout to export (a valid, current-version {@link LayoutPage}).
 */
export function exportLayout(doc: LayoutPage): string {
  return JSON.stringify(doc, null, 2);
}
