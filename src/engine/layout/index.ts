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
 * and reset-to-default (also FR-5) are a sibling operation, not part of this
 * module yet.
 */
export { resolveLayout, ResolveLayoutError } from './resolve.js';
export type {
  EffectiveLayout,
  LayoutLevel,
  ResolutionLevel,
  ResolveLayoutInputs,
} from './resolve.js';

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

// Migrate-on-read framework, owned by @gridmason/protocol, re-surfaced for
// engine consumers that build a registry or read the current version.
export { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry, layoutMigrators } from '@gridmason/protocol';
export type { Migrator, SchemaVersion, VersionedLayout } from '@gridmason/protocol';
