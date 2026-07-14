import { describe, expect, test, vi } from 'vitest';

import type { LayoutPage } from '@gridmason/protocol';
import { CURRENT_LAYOUT_SCHEMA_VERSION } from '@gridmason/protocol';

import type { ScopeKey } from '../../engine/layout/fork.js';
import { persistenceConformanceCases } from '../persistence-conformance.js';

import {
  DEV_PERSISTENCE_NAMESPACE,
  DEV_PERSISTENCE_WARNING,
  DevPersistenceAdapter,
} from './dev-persistence.js';

const KEY: ScopeKey = { owner: 'user', pageType: 'crm.customer-detail' };

function doc(name: string): LayoutPage {
  return {
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    page: 'crm.customer-detail',
    name,
    default: false,
    grid: { items: [] },
    hasTabs: false,
    tabs: [],
  };
}

/** A working `Storage` backed by a `Map`, plus its backing map so a test can inspect writes. */
function mapStorage(): { storage: Storage; map: Map<string, string> } {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  return { storage: store as unknown as Storage, map };
}

/** A `Storage` that throws on `setItem` — models Safari private mode. */
function throwingStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

// Silence the dev-only banner for every construction except the tests that
// assert it fires, so the suite output stays clean.
const silent = { warn: () => {} } as const;

// The bundled dev adapter must satisfy the same conformance suite a host would
// run — once on each backing (in-memory and a real `Storage`). Each case gets a
// fresh, empty store from the factory so isolation checks are meaningful.
describe.each([
  ['in-memory backing', () => new DevPersistenceAdapter({ ...silent, inMemory: true })],
  ['Storage backing', () => new DevPersistenceAdapter({ ...silent, storage: mapStorage().storage })],
] as const)('DevPersistenceAdapter conformance — %s', (_label, makeAdapter) => {
  for (const conformanceCase of persistenceConformanceCases) {
    test(conformanceCase.name, () => conformanceCase.run(makeAdapter));
  }
});

describe('DevPersistenceAdapter dev-only labeling', () => {
  test('warns loudly through console.warn by default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new DevPersistenceAdapter({ inMemory: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(DEV_PERSISTENCE_WARNING);
    spy.mockRestore();
  });

  test('routes the warning through a custom warn hook (no console noise)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warn = vi.fn();
    new DevPersistenceAdapter({ inMemory: true, warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(DEV_PERSISTENCE_WARNING);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('the warning names itself dev-only and forbids production', () => {
    expect(DEV_PERSISTENCE_WARNING).toMatch(/DEV-ONLY/);
    expect(DEV_PERSISTENCE_WARNING).toMatch(/production/i);
  });
});

describe('DevPersistenceAdapter backing selection', () => {
  test('persists across instances sharing a Storage (survives a reload)', async () => {
    const { storage } = mapStorage();
    const writer = new DevPersistenceAdapter({ ...silent, storage });
    await writer.put(KEY, doc('saved'));
    // A fresh adapter over the same store (as after a page reload) reads it back.
    const reader = new DevPersistenceAdapter({ ...silent, storage });
    expect(await reader.get(KEY)).toEqual(doc('saved'));
  });

  test('namespaces Storage keys with the default prefix', async () => {
    const { storage, map } = mapStorage();
    const adapter = new DevPersistenceAdapter({ ...silent, storage });
    await adapter.put(KEY, doc('x'));
    expect([...map.keys()].some((k) => k.startsWith(DEV_PERSISTENCE_NAMESPACE))).toBe(true);
  });

  test('honors a custom namespace', async () => {
    const { storage, map } = mapStorage();
    const adapter = new DevPersistenceAdapter({ ...silent, storage, namespace: 'demo:' });
    await adapter.put(KEY, doc('x'));
    expect([...map.keys()].every((k) => k.startsWith('demo:'))).toBe(true);
  });

  test('auto-detects ambient globalThis.localStorage when no storage is given', async () => {
    const { storage, map } = mapStorage();
    const g = globalThis as { localStorage?: Storage };
    const prior = g.localStorage;
    g.localStorage = storage;
    try {
      const adapter = new DevPersistenceAdapter(silent);
      await adapter.put(KEY, doc('ambient'));
      expect([...map.keys()].some((k) => k.startsWith(DEV_PERSISTENCE_NAMESPACE))).toBe(true);
      expect(await adapter.get(KEY)).toEqual(doc('ambient'));
    } finally {
      if (prior === undefined) delete g.localStorage;
      else g.localStorage = prior;
    }
  });

  test('falls back to in-memory when no Storage is available (Node)', async () => {
    // No ambient localStorage under the node test env; auto-detect → memory.
    const adapter = new DevPersistenceAdapter(silent);
    await adapter.put(KEY, doc('mem'));
    expect(await adapter.get(KEY)).toEqual(doc('mem'));
  });

  test('inMemory:true ignores a provided Storage', async () => {
    const { storage } = mapStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const adapter = new DevPersistenceAdapter({ ...silent, inMemory: true, storage });
    await adapter.put(KEY, doc('mem'));
    expect(setItem).not.toHaveBeenCalled();
    expect(await adapter.get(KEY)).toEqual(doc('mem'));
  });

  test('falls back to in-memory when the Storage probe throws (private mode)', async () => {
    const storage = throwingStorage();
    const adapter = new DevPersistenceAdapter({ ...silent, storage });
    // Despite the throwing storage, put/get still round-trips (via memory).
    await adapter.put(KEY, doc('resilient'));
    expect(await adapter.get(KEY)).toEqual(doc('resilient'));
  });
});

describe('DevPersistenceAdapter value semantics', () => {
  test('returns a fresh copy — mutating the result never corrupts the store', async () => {
    const adapter = new DevPersistenceAdapter({ ...silent, inMemory: true });
    await adapter.put(KEY, doc('original'));
    const got = await adapter.get(KEY);
    (got as { name: string }).name = 'mutated';
    const again = await adapter.get(KEY);
    expect(again?.name).toBe('original');
  });

  test('get/put/delete return Promises', async () => {
    const adapter = new DevPersistenceAdapter({ ...silent, inMemory: true });
    expect(adapter.put(KEY, doc('p'))).toBeInstanceOf(Promise);
    expect(adapter.get(KEY)).toBeInstanceOf(Promise);
    expect(adapter.delete(KEY)).toBeInstanceOf(Promise);
    await adapter.delete(KEY);
  });
});
