/**
 * `s7k-widgets-core` POC importer wiring (docs/SPEC.md §5, FR-14; protocol FR-6).
 *
 * The proof-of-concept persisted its dashboards as a JSON array under the
 * localStorage key {@link POC_LAYOUTS_STORAGE_KEY} with **no** `schemaVersion`.
 * This module is the engine-layer seam that brings such a dump forward into
 * current-version `LayoutDoc`s so the canvas can render it — reusing the
 * *converter* `@gridmason/protocol` ships (protocol FR-6) rather than redefining
 * the mapping here.
 *
 * ## The boundary → chain handoff
 *
 * The POC is notionally one version *below* the `LayoutDoc v1` baseline
 * ({@link POC_SCHEMA_VERSION} `0`), and the shipped migrate-on-read chain is
 * floored at v1 — it neither registers a `fromVersion 0` step nor migrates a
 * `schemaVersion < 1` document. So the port happens in two stages, exactly as the
 * protocol contract prescribes:
 *
 * 1. **Boundary.** `importS7kWidgetLayouts` (protocol) converts the parsed POC
 *    payload — POC page shape → `LayoutDoc v1` — source-qualifying every bare POC
 *    `widgetID` to `{ source: 'local', tag }` (the POC has no registry, so its
 *    widgets are host-bundled `local` widgets, SPEC §4), carrying `{x,y,w,h,i}`
 *    geometry and per-instance `props`, and dropping the POC's node uuids and
 *    `name`/`moved` presentation fields.
 * 2. **Chain.** Each converted document is then run through the normal
 *    migrate-on-read pipeline ({@link loadLayout}) to reach the current
 *    `schemaVersion`. The converter already stamps the current version, so with
 *    the default registry/target this stage is the idempotent identity — but it
 *    is the real seam: supply a {@link LoadLayoutOptions registry/target} and a
 *    converted doc is migrated forward (or, if it cannot be upgraded, surfaced as
 *    a `read-only` import failure) through the same code path any stored layout
 *    takes on load.
 *
 * ## Purity (SPEC §1, §2)
 *
 * DOM-free and network-free: the caller reads the string out of `localStorage`
 * and passes it in; this module `JSON.parse`s it and transforms JSON, making no
 * `window`/`fetch`/`fs` access. Total — malformed input yields a typed
 * {@link PocImportSourceError}, never a throw. Rendering the result is the
 * canvas's job; {@link toRenderablePocLayout} is the pure resolve+degrade
 * projection the canvas consumes.
 */
import {
  importS7kWidgetLayouts,
  POC_LAYOUTS_STORAGE_KEY,
} from '@gridmason/protocol';
import type { LayoutPage, PocImportErrorCode, SchemaVersion } from '@gridmason/protocol';

import { loadLayout, resolveLayout } from '../../layout/index.js';
import type { EffectiveLayout, LoadLayoutOptions } from '../../layout/index.js';
import { degradeUnavailableWidgets } from '../degrade.js';
import type { WidgetAvailability } from '../degrade.js';
import type { PageTypeInput } from '../../page-types/index.js';

/**
 * Why {@link importPocLayouts} rejected its input: the protocol converter's
 * structural {@link PocImportErrorCode}s, plus `invalid-json` when the storage
 * value is not JSON, and `read-only` when a converted document cannot be brought
 * to the current version by the migrate-on-read chain (only reachable when a
 * caller overrides the {@link LoadLayoutOptions registry/target}).
 */
export type PocImportSourceErrorCode = PocImportErrorCode | 'invalid-json' | 'read-only';

/** A non-throwing import failure; `message` echoes no widget identity (§8). */
export interface PocImportSourceError {
  /** Stable machine-readable cause (see {@link PocImportSourceErrorCode}). */
  readonly code: PocImportSourceErrorCode;
  /** Human-readable explanation (echoes no untrusted value). */
  readonly message: string;
  /** Dotted/indexed path to the offending node (`''` for a parse failure / root). */
  readonly path: string;
}

/** One imported POC page: a current-version `LayoutDoc` plus its load metadata. */
export interface ImportedPocPage {
  /** The POC route id this page targets (`doc.page`, e.g. `index`). */
  readonly page: string;
  /** The current-version document, ready to resolve + render. */
  readonly doc: LayoutPage;
  /** Whether the migrate-on-read chain upgraded the converter's output. */
  readonly migrated: boolean;
  /** The `schemaVersion` the converter stamped before the chain ran. */
  readonly loadedFrom: SchemaVersion;
}

/** The result of {@link importPocLayouts}: the imported pages, or a typed failure. */
export type ImportPocLayoutsResult =
  | { readonly ok: true; readonly pages: readonly ImportedPocPage[] }
  | { readonly ok: false; readonly error: PocImportSourceError };

/**
 * Import a `s7k-widgets-core` localStorage dump — the JSON string stored under
 * {@link POC_LAYOUTS_STORAGE_KEY} — into current-version `LayoutDoc`s.
 *
 * Total: not-JSON returns `invalid-json`, a malformed POC payload returns the
 * protocol converter's typed error, and (only under an overriding registry/target)
 * a document the chain cannot upgrade returns `read-only`. Never throws, makes no
 * network call, and rejects the whole dump on the first bad page rather than
 * applying it partially.
 *
 * @param json The raw `$widgetLayouts` value (an array of POC pages, as text).
 * @param options Migrate-on-read registry/target overrides (see {@link LoadLayoutOptions}).
 */
export function importPocLayouts(
  json: string,
  options: LoadLayoutOptions = {},
): ImportPocLayoutsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Deliberately generic — a parser message can quote input bytes, which for an
    // untrusted dump could echo a widget tag/name (§8). Name only the storage key.
    return {
      ok: false,
      error: {
        code: 'invalid-json',
        message: `the "${POC_LAYOUTS_STORAGE_KEY}" value was not valid JSON`,
        path: '',
      },
    };
  }

  const converted = importS7kWidgetLayouts(parsed);
  if (!converted.ok) return { ok: false, error: converted.error };

  const pages: ImportedPocPage[] = [];
  for (const [i, doc] of converted.docs.entries()) {
    const loaded = loadLayout(doc, options);
    if (loaded.readOnly) {
      // The warning is version-negotiation text (no widget identity), safe to echo.
      return { ok: false, error: { code: 'read-only', message: loaded.warning, path: `[${i}]` } };
    }
    pages.push({
      page: loaded.doc.page,
      doc: loaded.doc,
      migrated: loaded.migrated,
      loadedFrom: loaded.loadedFrom,
    });
  }
  return { ok: true, pages };
}

/**
 * A demo page type the imported POC layouts render on (FR-14 acceptance). The POC
 * had no typed page context, so this declares an empty {@link PageTypeInput.context}
 * and opts into user customization; its `pages: ['.*']` is the POC route-regex
 * escape hatch the page-type registry retains verbatim (never compiled here —
 * SPEC §8). A host resolves an imported page against this descriptor to render it.
 */
export const POC_DEMO_PAGE_TYPE: PageTypeInput = {
  id: 'gridmason.poc-demo',
  context: {},
  allow_user_customization: true,
  pages: ['.*'],
};

/** The render-ready projection of an imported POC page (see {@link toRenderablePocLayout}). */
export interface RenderablePocLayout {
  /** The resolved, degradation-projected layout, ready to assign to the canvas. */
  readonly effective: EffectiveLayout;
  /** How many instances collapsed to the anonymous unavailable-widget placeholder. */
  readonly degradedCount: number;
}

/**
 * Project an imported POC document to its render-ready form for a demo page:
 * resolve it as the page's `default` level ({@link resolveLayout}) then collapse
 * every widget this host lacks to the anonymous unavailable-widget placeholder
 * ({@link degradeUnavailableWidgets}). Pure — the input is never mutated, so the
 * original is kept for lossless restore when a missing widget later appears.
 *
 * @param doc A current-version imported POC layout (from {@link importPocLayouts}).
 * @param isAvailable Whether a given widget identity can be rendered here.
 */
export function toRenderablePocLayout(
  doc: LayoutPage,
  isAvailable: WidgetAvailability,
): RenderablePocLayout {
  const resolved = resolveLayout({ default: { layout: doc } });
  const degraded = degradeUnavailableWidgets(resolved.layout, isAvailable);
  return {
    effective: { layout: degraded.doc, lockedSlots: resolved.lockedSlots },
    degradedCount: degraded.degradedCount,
  };
}
