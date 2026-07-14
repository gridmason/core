/**
 * `LayoutDoc` schema validation (docs/SPEC.md §8, FR-13/FR-16): the structural
 * gate every imported layout must pass **before** any part of it is used. The
 * `@gridmason/protocol` migrate-on-read chain negotiates a document's
 * `schemaVersion` but does **not** check its shape — a current-version blob could
 * still be missing `grid`, carry a non-numeric coordinate, or nest a malformed
 * widget identity. This module is that missing structural check: it validates an
 * untrusted value against the `LayoutPage` contract and returns the typed
 * document, or the first structural fault — never a partially-trusted object.
 *
 * ## Security posture (SPEC §8, FR-16)
 *
 * Validation is pure structural inspection: no `new RegExp(userInput)` (no regex
 * at all), no dynamic code, no I/O, no network. Fault messages describe the
 * offending **field and type only** — they never echo a value, so a widget tag or
 * name from an untrusted layout cannot leak through an error string (the
 * no-capability-leakage rule, §6/§8). Unknown extra fields are ignored rather than
 * rejected, so a document carrying additive fields from a newer minor still loads.
 */
import type { LayoutPage } from '@gridmason/protocol';

/**
 * Why a value failed {@link validateLayoutDoc}. Callers switch on the code, not
 * the human message — these are stable.
 *
 * - `not-an-object` — a node expected to be a JSON object was not one (a string,
 *   array, `null`, …).
 * - `missing-field` — a required field was absent.
 * - `wrong-type` — a field was present but of the wrong JSON type.
 * - `empty-string` — a required non-empty string (an identity / key field) was
 *   the empty string, which is not a usable value.
 * - `not-finite` — a numeric field was absent-typed, `NaN`, or `±Infinity`.
 * - `bad-schema-version` — `schemaVersion` was not a positive integer.
 */
export type LayoutValidationCode =
  | 'not-an-object'
  | 'missing-field'
  | 'wrong-type'
  | 'empty-string'
  | 'not-finite'
  | 'bad-schema-version';

/**
 * A single structural fault. `message` is safe to log — it names the field and
 * expected type but never echoes a value, so no untrusted tag/name leaks (§8).
 */
export interface LayoutValidationError {
  /** Stable machine-readable cause (see {@link LayoutValidationCode}). */
  readonly code: LayoutValidationCode;
  /** Human-readable explanation of the field + expected type (echoes no value). */
  readonly message: string;
  /** Dotted/indexed path to the offending node from the root (`''` is the root). */
  readonly path: string;
}

/** The result of {@link validateLayoutDoc}: the typed doc, or the first fault. */
export type LayoutValidation =
  | { readonly ok: true; readonly doc: LayoutPage }
  | { readonly ok: false; readonly error: LayoutValidationError };

/** A structural check outcome: `undefined` when the node is well-formed, else the fault. */
type Fault = LayoutValidationError | undefined;

/** Build a fault record. */
function fault(code: LayoutValidationCode, path: string, message: string): LayoutValidationError {
  return { code, message, path };
}

/** A plain JSON object — not `null`, not an array, not a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extend a dotted path with a child key (`''` root → bare key). */
function at(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** Read a required field, faulting when it is absent. */
function field(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): { ok: true; value: unknown } | { ok: false; error: LayoutValidationError } {
  if (!(key in obj)) {
    return { ok: false, error: fault('missing-field', at(path, key), `missing required field '${key}'`) };
  }
  return { ok: true, value: obj[key] };
}

/** Validate that a value is a string (optionally non-empty). */
function checkString(value: unknown, path: string, nonEmpty: boolean): Fault {
  if (typeof value !== 'string') return fault('wrong-type', path, 'expected a string');
  if (nonEmpty && value.length === 0) return fault('empty-string', path, 'expected a non-empty string');
  return undefined;
}

/** Require a string field (optionally non-empty). */
function requireString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  nonEmpty: boolean,
): Fault {
  const f = field(obj, key, path);
  if (!f.ok) return f.error;
  return checkString(f.value, at(path, key), nonEmpty);
}

/** Require a boolean field. */
function requireBoolean(obj: Record<string, unknown>, key: string, path: string): Fault {
  const f = field(obj, key, path);
  if (!f.ok) return f.error;
  if (typeof f.value !== 'boolean') return fault('wrong-type', at(path, key), 'expected a boolean');
  return undefined;
}

/** Require a finite-number field (rejects `NaN`, `±Infinity`, and non-numbers). */
function requireFiniteNumber(obj: Record<string, unknown>, key: string, path: string): Fault {
  const f = field(obj, key, path);
  if (!f.ok) return f.error;
  if (typeof f.value !== 'number') return fault('wrong-type', at(path, key), 'expected a number');
  if (!Number.isFinite(f.value)) return fault('not-finite', at(path, key), 'expected a finite number');
  return undefined;
}

/** Validate a `LayoutWidget.widgetID` (source-qualified identity). */
function checkWidgetId(value: unknown, path: string): Fault {
  if (!isRecord(value)) return fault('not-an-object', path, 'expected an object');
  return requireString(value, 'source', path, true) ?? requireString(value, 'tag', path, true);
}

/** Validate one placed widget (`LayoutWidget`). */
function checkWidget(value: unknown, path: string): Fault {
  if (!isRecord(value)) return fault('not-an-object', path, 'expected an object');

  const id = field(value, 'widgetID', path);
  if (!id.ok) return id.error;
  const idFault = checkWidgetId(id.value, at(path, 'widgetID'));
  if (idFault !== undefined) return idFault;

  const iFault = requireString(value, 'i', path, true);
  if (iFault !== undefined) return iFault;

  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const numFault = requireFiniteNumber(value, key, path);
    if (numFault !== undefined) return numFault;
  }

  // `props` and `slot` are optional; validate only when supplied.
  if (value.props !== undefined && !isRecord(value.props)) {
    return fault('wrong-type', at(path, 'props'), 'expected an object');
  }
  if (value.slot !== undefined) {
    const slotFault = checkString(value.slot, at(path, 'slot'), false);
    if (slotFault !== undefined) return slotFault;
  }
  return undefined;
}

/** Validate a `LayoutGrid` (an object with an `items` array of widgets). */
function checkGrid(value: unknown, path: string): Fault {
  if (!isRecord(value)) return fault('not-an-object', path, 'expected an object');
  const items = field(value, 'items', path);
  if (!items.ok) return items.error;
  if (!Array.isArray(items.value)) return fault('wrong-type', at(path, 'items'), 'expected an array');
  const itemsPath = at(path, 'items');
  for (let i = 0; i < items.value.length; i++) {
    const itemFault = checkWidget(items.value[i], `${itemsPath}[${i}]`);
    if (itemFault !== undefined) return itemFault;
  }
  return undefined;
}

/** Validate a `LayoutTab` (a `name` and its own grid). */
function checkTab(value: unknown, path: string): Fault {
  if (!isRecord(value)) return fault('not-an-object', path, 'expected an object');
  const nameFault = requireString(value, 'name', path, false);
  if (nameFault !== undefined) return nameFault;
  const grid = field(value, 'grid', path);
  if (!grid.ok) return grid.error;
  return checkGrid(grid.value, at(path, 'grid'));
}

/**
 * Validate an untrusted value against the `LayoutPage` schema (docs/SPEC.md §5,
 * §3.3). Returns the typed document on success, or the **first** structural fault
 * — the document is either wholly valid or rejected, never partially applied
 * (FR-13). Pure and total: it never throws and never mutates its input.
 *
 * This checks structure, not schema *version* negotiation — run
 * `@gridmason/protocol`'s `migrate` (via the engine's `loadLayout`) to upgrade an
 * older document first, then validate the current-version result here.
 *
 * @param value A parsed, untrusted value (e.g. from `JSON.parse`).
 */
export function validateLayoutDoc(value: unknown): LayoutValidation {
  if (!isRecord(value)) {
    return reject(fault('not-an-object', '', 'expected a layout object'));
  }

  const schemaVersion = field(value, 'schemaVersion', '');
  if (!schemaVersion.ok) return reject(schemaVersion.error);
  if (
    typeof schemaVersion.value !== 'number' ||
    !Number.isInteger(schemaVersion.value) ||
    schemaVersion.value < 1
  ) {
    return reject(fault('bad-schema-version', 'schemaVersion', 'expected a positive integer schemaVersion'));
  }

  const scalarFault =
    requireString(value, 'page', '', true) ??
    requireString(value, 'name', '', false) ??
    requireBoolean(value, 'default', '') ??
    requireBoolean(value, 'hasTabs', '');
  if (scalarFault !== undefined) return reject(scalarFault);

  const grid = field(value, 'grid', '');
  if (!grid.ok) return reject(grid.error);
  const gridFault = checkGrid(grid.value, 'grid');
  if (gridFault !== undefined) return reject(gridFault);

  const tabs = field(value, 'tabs', '');
  if (!tabs.ok) return reject(tabs.error);
  if (!Array.isArray(tabs.value)) return reject(fault('wrong-type', 'tabs', 'expected an array'));
  for (let i = 0; i < tabs.value.length; i++) {
    const tabFault = checkTab(tabs.value[i], `tabs[${i}]`);
    if (tabFault !== undefined) return reject(tabFault);
  }

  return { ok: true, doc: value as unknown as LayoutPage };
}

/** Wrap a fault as a failed validation result. */
function reject(error: LayoutValidationError): LayoutValidation {
  return { ok: false, error };
}
