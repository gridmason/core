/**
 * LayoutDoc load/normalize operation (docs/SPEC.md §5, FR-4): the engine-layer
 * entry point that reads a persisted `LayoutDoc` of any known version and hands
 * the canvas a current-version document — or a read-only signal.
 *
 * The migrate-on-read *framework* (the per-step migrator registry and the chain
 * runner) is owned by `@gridmason/protocol`; this module does not redefine the
 * schema. It wraps `protocol.migrate` into the operation the host actually needs
 * on load:
 *
 * - **migrate-on-read** — an older-version document is upgraded in memory to the
 *   current version.
 * - **write-back** — the result carries a `migrated` flag so the persistence
 *   adapter knows to write the upgraded (current) document back; an
 *   already-current document reports `migrated: false` and is never rewritten.
 * - **read-only-on-newer** — a document whose `schemaVersion` is newer than this
 *   build understands (or that needs a migrator this build lacks) is returned
 *   untouched with `readOnly: true` and a `warning`, so the canvas (C-E3) can
 *   render a read-only banner. No migrator runs and the document is never
 *   rewritten — no destructive downgrade.
 *
 * DOM-free by contract (SPEC §2): this operates on JSON and returns state; it
 * never renders the banner it describes.
 */
import { CURRENT_LAYOUT_SCHEMA_VERSION, migrate } from '@gridmason/protocol';
import type {
  LayoutPage,
  MigratorRegistry,
  SchemaVersion,
  VersionedLayout,
} from '@gridmason/protocol';

/** Options for {@link loadLayout}; mirrors the protocol migrate surface. */
export interface LoadLayoutOptions {
  /**
   * Migrator registry supplying the per-step migrators. Defaults to the
   * protocol's shipped `layoutMigrators` (which the host and dependent packages
   * register their steps into — e.g. the POC importer, FR-14).
   */
  readonly registry?: MigratorRegistry;
  /**
   * Version to upgrade to. Defaults to {@link CURRENT_LAYOUT_SCHEMA_VERSION} —
   * the version this build reads and writes.
   */
  readonly target?: SchemaVersion;
}

/**
 * A layout loaded successfully: it was already current, or was upgraded to the
 * current version in memory.
 */
export interface LoadedLayout {
  readonly readOnly: false;
  /** The layout at the target (current) schema version, ready to render. */
  readonly doc: LayoutPage;
  /**
   * Whether the document was upgraded from an older version. When `true`, the
   * persistence layer should write {@link doc} back so storage advances to the
   * current version (write-back-on-read); when `false` the stored document is
   * already current and must not be rewritten.
   */
  readonly migrated: boolean;
  /** The `schemaVersion` the document declared before loading. */
  readonly loadedFrom: SchemaVersion;
}

/**
 * A layout that could not be safely loaded: its `schemaVersion` is newer than
 * this build understands, or a required migrator is missing. The document is
 * returned **untouched** — never migrated, never rewritten.
 */
export interface ReadOnlyLayout {
  readonly readOnly: true;
  /** The untouched input document (byte-identical to what was passed in). */
  readonly doc: VersionedLayout;
  /** Human-readable reason, suitable for the canvas read-only banner (C-E3). */
  readonly warning: string;
  /** The (unknown / newer) `schemaVersion` the document declared. */
  readonly loadedFrom: SchemaVersion;
}

/** The result of {@link loadLayout}: discriminated on `readOnly`. */
export type LoadLayoutResult = LoadedLayout | ReadOnlyLayout;

/**
 * Load and normalize a `LayoutDoc` for rendering (migrate-on-read).
 *
 * Runs the protocol migrate-on-read chain and reshapes its result for the host:
 * a loadable document reports whether it was upgraded (so persistence can write
 * back the current version), and an unknown-newer document is surfaced as
 * read-only with a warning rather than being rewritten. Never throws on a
 * version-negotiation ground and never mutates the input.
 *
 * @param doc A layout document at any schema version.
 * @param options Registry and target overrides (see {@link LoadLayoutOptions}).
 */
export function loadLayout(
  doc: VersionedLayout,
  options: LoadLayoutOptions = {},
): LoadLayoutResult {
  const loadedFrom = doc.schemaVersion;
  const target = options.target ?? CURRENT_LAYOUT_SCHEMA_VERSION;
  const result = migrate(doc, options);
  if (result.readOnly) {
    return { readOnly: true, doc: result.doc, warning: result.reason, loadedFrom };
  }
  return { readOnly: false, doc: result.doc, migrated: loadedFrom !== target, loadedFrom };
}
