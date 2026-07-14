/**
 * Layout import (docs/SPEC.md §8, FR-13/FR-16): parse untrusted JSON text into a
 * validated `LayoutDoc`, or reject it. The single JSON-in entry point for a saved
 * layout a user pastes or uploads.
 *
 * ## Security posture (SPEC §8, FR-16)
 *
 * Import is **JSON-in only**. It parses with `JSON.parse` (no `eval`, no
 * `new Function`) and validates the result against the `LayoutPage` schema
 * ({@link validateLayoutDoc}) **before** returning it — an invalid input is
 * rejected whole, never partially applied. There is deliberately **no** URL /
 * base64 / `<script>` import path (the POC's had one; it is absent here), no
 * `new RegExp(userInput)`, and no network call — import operates purely on the
 * provided string.
 *
 * A malformed-JSON fault reports a **fixed** message, never the `JSON.parse`
 * error text: a parser's message can quote a fragment of the offending input,
 * which for an untrusted layout could echo a widget tag/name and leak a
 * capability (§6/§8). The fault says only that the input was not valid JSON.
 *
 * Import validates *shape*, not *availability*: a document referencing a widget
 * this instance does not have is still valid JSON and imports successfully — the
 * unavailable references degrade to anonymous cards at render time via
 * {@link degradeUnavailableWidgets}, and restore losslessly when the widget appears.
 */
import type { LayoutPage } from '@gridmason/protocol';

import { validateLayoutDoc } from './validate.js';
import type { LayoutValidationCode } from './validate.js';

/**
 * Why {@link importLayout} rejected its input: the structural
 * {@link LayoutValidationCode}s, plus `invalid-json` for text that is not JSON.
 */
export type LayoutImportErrorCode = LayoutValidationCode | 'invalid-json';

/** A non-throwing import failure; `message` echoes no value (§8). */
export interface LayoutImportError {
  /** Stable machine-readable cause (see {@link LayoutImportErrorCode}). */
  readonly code: LayoutImportErrorCode;
  /** Human-readable explanation (echoes no untrusted value). */
  readonly message: string;
  /** Dotted/indexed path to the offending node (`''` for a parse failure / root). */
  readonly path: string;
}

/** The result of {@link importLayout}: the validated doc, or a typed failure. */
export type ImportLayoutResult =
  | { readonly ok: true; readonly doc: LayoutPage }
  | { readonly ok: false; readonly error: LayoutImportError };

/**
 * Parse and validate a layout from JSON text. Total: malformed JSON or a
 * schema-invalid document returns `{ ok: false, error }`; a valid document
 * returns `{ ok: true, doc }`. Never throws, makes no network call, and applies
 * nothing until the whole document validates (FR-13, FR-16).
 *
 * @param json The layout as JSON text (e.g. the output of {@link exportLayout}).
 */
export function importLayout(json: string): ImportLayoutResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Deliberately generic — the parser's own message can quote input bytes,
    // which for an untrusted layout could echo a widget tag/name (§8).
    return { ok: false, error: { code: 'invalid-json', message: 'input is not valid JSON', path: '' } };
  }

  const validation = validateLayoutDoc(parsed);
  if (!validation.ok) return { ok: false, error: validation.error };
  return { ok: true, doc: validation.doc };
}
