/**
 * Widget type catalog (docs/SPEC.md §4, FR-1).
 *
 * The headless, DOM-free registry of the widget *types* a host has loaded. It
 * holds manifest-shaped entries keyed by **source-qualified identity**
 * `(source, tag)` — a bare `tag` is never identity (SPEC §4). Registration is
 * the runtime analogue of `customElements.define`: a widget's custom-element
 * `tag` shares one per-document namespace, so a given tag may be bound to only
 * one source at a time. A second source claiming a bound tag — or the same
 * source re-registering — is **refused, never crashed** (SPEC §4), and every
 * refusal is surfaced to the optional telemetry sink.
 *
 * Loading, verification, and mounting live elsewhere (registry + host shell +
 * canvas); the catalog is pure bookkeeping over `@gridmason/protocol` types.
 */
import type { Manifest, TagViolation, WidgetID } from '@gridmason/protocol';
import { compareWidgetIds, lintTag, sourcesEqual, widgetIdKey } from '@gridmason/protocol';

/** A registered widget type: its source-qualified identity plus its manifest. */
export interface WidgetCatalogEntry {
  /** Source-qualified identity `(source, tag)` this entry is keyed by. */
  readonly id: WidgetID;
  /** The manifest the widget registered with (`id.tag === manifest.tag`). */
  readonly manifest: Manifest;
}

/**
 * Why a {@link WidgetCatalog.register} call was refused. Callers switch on the
 * code, not the human message — these are stable.
 *
 * - `invalid-tag` — the manifest `tag` failed the tag lint (not publisher-
 *   prefixed, uppercase, no hyphen, illegal characters); `customElements.define`
 *   would throw on it, so the catalog refuses up front.
 * - `not-a-widget` — the manifest `kind` is not `widget` (page types, plugins,
 *   and layouts do not register as placeable widget types).
 * - `tag-owned-by-other-source` — a *different* source already owns this tag;
 *   binding it here would let a saved instance be silently impersonated (SPEC §4).
 * - `duplicate-identity` — the *same* `(source, tag)` is already registered; a
 *   tag cannot be defined twice.
 */
export type CatalogRefusalReason =
  | 'invalid-tag'
  | 'not-a-widget'
  | 'tag-owned-by-other-source'
  | 'duplicate-identity';

/**
 * A registration refusal, emitted to the telemetry sink and returned from
 * {@link WidgetCatalog.register}. Carries the attempted identity plus, where the
 * reason supplies it, the incumbent identity (collisions) or the tag-lint
 * violations (`invalid-tag`).
 */
export interface CatalogRefusalEvent {
  /** Stable discriminator for telemetry pipelines. */
  readonly type: 'catalog.register.refused';
  /** Why the registration was refused. */
  readonly reason: CatalogRefusalReason;
  /** The `(source, tag)` identity whose registration was refused. */
  readonly attempted: WidgetID;
  /** The identity already holding the tag — present only for collision reasons. */
  readonly incumbent?: WidgetID;
  /** Tag-lint failures — present only when `reason` is `invalid-tag`. */
  readonly tagViolations?: readonly TagViolation[];
}

/**
 * A telemetry sink for registration refusals (SPEC §4: "refuses that remote with
 * telemetry"). A focused, catalog-scoped surface; the full telemetry adapter
 * (per-widget error + latency attribution, SPEC §7) lands with the adapter
 * interfaces and is a superset of this shape.
 */
export type CatalogTelemetry = (event: CatalogRefusalEvent) => void;

/** Options for constructing a {@link WidgetCatalog}. */
export interface WidgetCatalogOptions {
  /** Called with a {@link CatalogRefusalEvent} on every refused registration. */
  readonly telemetry?: CatalogTelemetry;
}

/**
 * The outcome of {@link WidgetCatalog.register}: the stored entry on success, or
 * the {@link CatalogRefusalEvent} on refusal. Registration never throws — a bad
 * or colliding manifest is a value, not an exception (SPEC §4).
 */
export type CatalogRegistration =
  | { readonly ok: true; readonly entry: WidgetCatalogEntry }
  | { readonly ok: false; readonly event: CatalogRefusalEvent };

/**
 * A source-qualified widget type registry. One instance models one document's
 * tag namespace: each `tag` is bound to at most one `source`, and identities are
 * compared on `(source, tag)` together via `@gridmason/protocol` helpers.
 */
export class WidgetCatalog {
  /** Entries keyed by `widgetIdKey(id)` (source + tag). */
  readonly #entries = new Map<string, WidgetCatalogEntry>();
  /** The single owning identity of each bound bare `tag`. */
  readonly #tagOwners = new Map<string, WidgetID>();
  readonly #telemetry: CatalogTelemetry | undefined;

  constructor(options: WidgetCatalogOptions = {}) {
    this.#telemetry = options.telemetry;
  }

  /**
   * Register a widget type loaded from `source` (a `local` / `sideload:<origin>`
   * / registry-id string, SPEC §4). The tag comes from the manifest. Returns the
   * stored entry, or a refusal (also emitted to the telemetry sink). Never throws.
   */
  register(source: string, manifest: Manifest): CatalogRegistration {
    const id: WidgetID = { source, tag: manifest.tag };

    const lint = lintTag(manifest.tag, manifest.publisher);
    if (!lint.ok) {
      return this.#refuse({ reason: 'invalid-tag', attempted: id, tagViolations: lint.violations });
    }

    if (manifest.kind !== 'widget') {
      return this.#refuse({ reason: 'not-a-widget', attempted: id });
    }

    const incumbent = this.#tagOwners.get(manifest.tag);
    if (incumbent) {
      const reason: CatalogRefusalReason = sourcesEqual(incumbent.source, source)
        ? 'duplicate-identity'
        : 'tag-owned-by-other-source';
      return this.#refuse({ reason, attempted: id, incumbent });
    }

    const entry: WidgetCatalogEntry = { id, manifest };
    this.#entries.set(widgetIdKey(id), entry);
    this.#tagOwners.set(manifest.tag, id);
    return { ok: true, entry };
  }

  /** The entry for an exact `(source, tag)` identity, or `undefined`. */
  get(id: WidgetID): WidgetCatalogEntry | undefined {
    return this.#entries.get(widgetIdKey(id));
  }

  /** Whether an exact `(source, tag)` identity is registered. */
  has(id: WidgetID): boolean {
    return this.#entries.has(widgetIdKey(id));
  }

  /**
   * The entry owning a bare `tag`, regardless of source, or `undefined`. Since a
   * tag is bound to one source, this resolves the tag to its single owner — the
   * binding a layout's saved instance must match at resolution (SPEC §4).
   */
  getByTag(tag: string): WidgetCatalogEntry | undefined {
    const owner = this.#tagOwners.get(tag);
    return owner ? this.#entries.get(widgetIdKey(owner)) : undefined;
  }

  /**
   * Remove the entry for an exact identity, freeing its tag. Returns whether an
   * entry was removed. An identity whose source does not match the tag's owner is
   * not registered here, so this is a no-op returning `false`.
   */
  unregister(id: WidgetID): boolean {
    const entry = this.#entries.get(widgetIdKey(id));
    if (!entry) return false;
    this.#entries.delete(widgetIdKey(id));
    this.#tagOwners.delete(entry.manifest.tag);
    return true;
  }

  /** All entries, ordered by identity (`compareWidgetIds`) for determinism. */
  list(): readonly WidgetCatalogEntry[] {
    return [...this.#entries.values()].sort((a, b) => compareWidgetIds(a.id, b.id));
  }

  /** The number of registered widget types. */
  get size(): number {
    return this.#entries.size;
  }

  /** Drop every registration, emptying the tag namespace. */
  clear(): void {
    this.#entries.clear();
    this.#tagOwners.clear();
  }

  /** Build a refusal event, emit it to telemetry, and return the failed result. */
  #refuse(fields: {
    reason: CatalogRefusalReason;
    attempted: WidgetID;
    incumbent?: WidgetID;
    tagViolations?: readonly TagViolation[];
  }): CatalogRegistration {
    const event: CatalogRefusalEvent = {
      type: 'catalog.register.refused',
      reason: fields.reason,
      attempted: fields.attempted,
      ...(fields.incumbent ? { incumbent: fields.incumbent } : {}),
      ...(fields.tagViolations ? { tagViolations: fields.tagViolations } : {}),
    };
    this.#telemetry?.(event);
    return { ok: false, event };
  }
}
