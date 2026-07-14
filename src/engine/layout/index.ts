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

// Migrate-on-read framework, owned by @gridmason/protocol, re-surfaced for
// engine consumers that build a registry or read the current version.
export { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry, layoutMigrators } from '@gridmason/protocol';
export type { Migrator, SchemaVersion, VersionedLayout } from '@gridmason/protocol';
