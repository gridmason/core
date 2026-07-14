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
 * 3-level resolution/governance (`resolveLayout`, FR-5) is a later epic (C-E2)
 * and deliberately not part of this module yet.
 */
export { loadLayout } from './load.js';
export type {
  LoadedLayout,
  LoadLayoutOptions,
  LoadLayoutResult,
  ReadOnlyLayout,
} from './load.js';

// Migrate-on-read framework, owned by @gridmason/protocol, re-surfaced for
// engine consumers that build a registry or read the current version.
export { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry, layoutMigrators } from '@gridmason/protocol';
export type { Migrator, SchemaVersion, VersionedLayout } from '@gridmason/protocol';
