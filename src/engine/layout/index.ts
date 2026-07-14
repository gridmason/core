/**
 * LayoutDoc engine operations (docs/SPEC.md §5).
 *
 * FR-4 — migrate-on-read, write-back, read-only-on-newer — lands here as
 * {@link loadLayout}, the engine-layer load/normalize entry point over the
 * `LayoutDoc` schema owned by `@gridmason/protocol`. The migrate-on-read
 * framework (migrator registry + chain runner) is protocol's; this barrel
 * re-surfaces those primitives alongside `loadLayout` so engine consumers meet
 * layout operations at one import.
 *
 * 3-level resolution/governance (`resolveLayout`, FR-5, SPEC §5) lands here as
 * {@link resolveLayout}: the pure merge/lock engine that composes the default,
 * org, and user levels into one {@link EffectiveLayout}. Copy-on-write forking
 * and reset-to-default (also FR-5) land as {@link forkOnEdit} / {@link resetLevel},
 * with {@link layoutsEqual} the structural diff that decides a genuine edit.
 */
export { resolveLayout, ResolveLayoutError } from './resolve.js';
export type {
  EffectiveLayout,
  LayoutLevel,
  ResolutionLevel,
  ResolveLayoutInputs,
} from './resolve.js';

// Copy-on-write fork + reset-to-default per level (FR-5, SPEC §5): the write-side
// operations over the three governance levels, plus the persistence scopeKey shape.
export { cloneLayout, forkOnEdit, resetLevel, scopeKeyString } from './fork.js';
export type { ForkResult, ScopeKey, ScopeOwner } from './fork.js';

// The structural diff behind fork detection — replaces the POC's JSON.stringify
// hash so reorder-/whitespace-only serialization differences never fork.
export { gridsEqual, layoutsEqual, structuralEqual } from './structural-diff.js';

// Resolution-time gating (FR-7, SPEC §6): the picker's four checks re-run on a
// resolved layout's persisted instances, silently omitting the ones now gated
// off / unpermitted without touching the saved doc.
export { gateResolvedLayout, resolveAndGateLayout } from './gating.js';
export type { ResolutionGatingContext, WidgetManifestSource } from './gating.js';

export { loadLayout } from './load.js';
export type {
  LoadedLayout,
  LoadLayoutOptions,
  LoadLayoutResult,
  ReadOnlyLayout,
} from './load.js';

// The observable current-layout holder (LayoutManager, SPEC §2): holds the
// page's LayoutDoc and emits change events on load/replace for the canvas.
export { LayoutStore } from './store.js';
export type {
  LayoutChangedEvent,
  LayoutChangeEvent,
  LayoutLoadedEvent,
  LayoutStoreEventMap,
} from './store.js';

// Protocol contract pass-throughs: CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry,
// and layoutMigrators are defined and owned by @gridmason/protocol (the migrate-on-read
// framework — schema version + migrator registry + chain runner). Core neither defines
// nor wraps them; it re-surfaces them verbatim so an engine consumer that builds a
// registry or reads the current version meets them at this one barrel instead of
// reaching into the protocol package directly.
export { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry, layoutMigrators } from '@gridmason/protocol';
export type { Migrator, SchemaVersion, VersionedLayout } from '@gridmason/protocol';
