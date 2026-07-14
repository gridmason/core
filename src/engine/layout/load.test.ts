import { CURRENT_LAYOUT_SCHEMA_VERSION, MigratorRegistry } from '@gridmason/protocol';
import type { LayoutPage, Migrator, VersionedLayout } from '@gridmason/protocol';
import { layoutVectors } from '@gridmason/protocol/vectors';
import { describe, expect, test } from 'vitest';

import { loadLayout } from './load.js';
import type { LoadLayoutOptions } from './load.js';

// A minimal, well-formed current-version (v1) LayoutDoc.
const v1Doc: LayoutPage = {
  schemaVersion: 1,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: { items: [] },
  tabs: [],
};

// A pure v1→v2 step: stamp a `z` z-order on every grid item (non-mutating).
const v1ToV2: Migrator = {
  fromVersion: 1,
  migrate: (doc) => {
    const page = doc as LayoutPage;
    return {
      ...page,
      schemaVersion: 2,
      grid: { items: page.grid.items.map((item) => ({ ...item, z: 0 })) },
    };
  },
};

describe('loadLayout', () => {
  // Acceptance: the published @gridmason/protocol LayoutDoc vectors all pass
  // through load/normalize with the outcome the protocol contract prescribes.
  describe('the published protocol layout vectors pass through', () => {
    test.each(layoutVectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
      const registry = new MigratorRegistry();
      for (const migrator of vector.migrators) registry.register(migrator);

      const options: LoadLayoutOptions =
        vector.target === undefined ? { registry } : { registry, target: vector.target };
      const result = loadLayout(vector.doc, options);

      if (vector.expected.readOnly) {
        expect(result.readOnly).toBe(true);
        // "never rewrites": the untouched input document is returned verbatim.
        expect(result.doc).toBe(vector.doc);
        if (vector.expected.reasonIncludes !== undefined) {
          // The read-only result narrows; assert on its warning text.
          if (result.readOnly) expect(result.warning).toContain(vector.expected.reasonIncludes);
        }
      } else {
        expect(result.readOnly).toBe(false);
        expect(result.doc).toStrictEqual(vector.expected.doc);
        const target = vector.target ?? CURRENT_LAYOUT_SCHEMA_VERSION;
        if (!result.readOnly) {
          expect(result.migrated).toBe(vector.doc.schemaVersion !== target);
        }
      }
    });
  });

  test('an already-current document loads unchanged and needs no write-back', () => {
    const result = loadLayout(v1Doc);

    expect(result.readOnly).toBe(false);
    if (result.readOnly) throw new Error('expected a loadable result');
    expect(result.doc).toBe(v1Doc);
    expect(result.migrated).toBe(false);
    expect(result.loadedFrom).toBe(1);
  });

  test('an older-version document migrates in memory and signals write-back', () => {
    const registry = new MigratorRegistry().register(v1ToV2);

    const result = loadLayout(v1Doc, { registry, target: 2 });

    expect(result.readOnly).toBe(false);
    if (result.readOnly) throw new Error('expected a loadable result');
    // Upgraded in memory to the target version...
    expect(result.doc.schemaVersion).toBe(2);
    // ...and flagged so persistence writes the current version back.
    expect(result.migrated).toBe(true);
    expect(result.loadedFrom).toBe(1);
    // The input was not mutated (migrate-on-read is pure).
    expect(v1Doc.schemaVersion).toBe(1);
  });

  test('an unknown-newer document is read-only, warned, and byte-identical out', () => {
    const newerDoc = {
      schemaVersion: 99,
      page: 'crm.customer-detail',
      name: 'From a newer build',
      default: false,
      hasTabs: false,
      grid: { items: [] },
      tabs: [],
      someUnknownFutureField: 'must survive untouched',
    } as unknown as VersionedLayout;
    const snapshot = structuredClone(newerDoc);

    const result = loadLayout(newerDoc);

    expect(result.readOnly).toBe(true);
    if (!result.readOnly) throw new Error('expected a read-only result');
    // No migrator ran, no rewrite: same reference and byte-identical content.
    expect(result.doc).toBe(newerDoc);
    expect(result.doc).toStrictEqual(snapshot);
    expect(result.warning).toContain('newer');
    expect(result.loadedFrom).toBe(99);
  });

  test('a document missing an intermediate migrator is read-only, not partially upgraded', () => {
    const registry = new MigratorRegistry().register(v1ToV2);

    // Target v3 but only the v1→v2 step exists: the v2→v3 gap is unbridgeable.
    const result = loadLayout(v1Doc, { registry, target: 3 });

    expect(result.readOnly).toBe(true);
    if (!result.readOnly) throw new Error('expected a read-only result');
    expect(result.doc).toBe(v1Doc);
    expect(result.warning).toContain('2');
  });
});
