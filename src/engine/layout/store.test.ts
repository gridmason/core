import { MigratorRegistry } from '@gridmason/protocol';
import type { LayoutPage, Migrator } from '@gridmason/protocol';
import { describe, expect, test, vi } from 'vitest';

import { LayoutStore } from './store.js';
import type { LayoutChangedEvent, LayoutLoadedEvent } from './store.js';

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

// A v1→v2 step plus a target override, so load() can exercise the
// migrate-on-read (migrated: true) branch (current is v1; migrators must step up
// from a positive version, so we migrate v1 → v2 with target 2 — the pattern the
// loadLayout vectors use).
const v2Doc: LayoutPage = { ...v1Doc, schemaVersion: 2 };
const v1ToV2: Migrator = {
  fromVersion: 1,
  migrate: () => v2Doc,
};

function registryWith(migrator: Migrator): MigratorRegistry {
  const registry = new MigratorRegistry();
  registry.register(migrator);
  return registry;
}

describe('LayoutStore', () => {
  test('starts empty: no current document and not read-only', () => {
    const store = new LayoutStore();
    expect(store.current).toBeUndefined();
    expect(store.readOnly).toBe(false);
  });

  describe('load', () => {
    test('adopts an already-current document as current and emits layout:loaded', () => {
      const store = new LayoutStore();
      const events: LayoutLoadedEvent[] = [];
      store.events.on('layout:loaded', (event) => events.push(event));

      const result = store.load(v1Doc);

      expect(result.readOnly).toBe(false);
      if (result.readOnly) throw new Error('expected a loadable result');
      expect(result.migrated).toBe(false);
      expect(store.current).toBe(v1Doc);
      expect(store.readOnly).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'layout:loaded', result });
    });

    test('migrate-on-read: an older document is upgraded and becomes current', () => {
      const store = new LayoutStore();
      const result = store.load(v1Doc, { registry: registryWith(v1ToV2), target: 2 });

      expect(result.readOnly).toBe(false);
      if (result.readOnly) throw new Error('expected a loadable result');
      expect(result.migrated).toBe(true);
      expect(store.current).toBe(v2Doc);
      expect(store.readOnly).toBe(false);
    });

    test('read-only-on-newer: current stays undefined and readOnly flips true', () => {
      const store = new LayoutStore();
      const listener = vi.fn();
      store.events.on('layout:loaded', listener);

      // schemaVersion 2 is newer than this build's current (1) → read-only.
      const result = store.load({ schemaVersion: 2 });

      expect(result.readOnly).toBe(true);
      expect(store.current).toBeUndefined();
      expect(store.readOnly).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ type: 'layout:loaded', result });
    });

    test('a later loadable load clears an earlier read-only state', () => {
      const store = new LayoutStore();
      store.load({ schemaVersion: 2 });
      expect(store.readOnly).toBe(true);

      store.load(v1Doc);
      expect(store.readOnly).toBe(false);
      expect(store.current).toBe(v1Doc);
    });
  });

  describe('replace', () => {
    test('swaps the current document and emits layout:changed', () => {
      const store = new LayoutStore();
      store.load(v1Doc);

      const events: LayoutChangedEvent[] = [];
      store.events.on('layout:changed', (event) => events.push(event));

      const edited: LayoutPage = { ...v1Doc, name: 'Edited' };
      store.replace(edited);

      expect(store.current).toBe(edited);
      expect(events).toEqual([{ type: 'layout:changed', doc: edited }]);
    });

    test('clears a prior read-only state', () => {
      const store = new LayoutStore();
      store.load({ schemaVersion: 2 });
      expect(store.readOnly).toBe(true);

      store.replace(v1Doc);

      expect(store.readOnly).toBe(false);
      expect(store.current).toBe(v1Doc);
    });
  });
});
