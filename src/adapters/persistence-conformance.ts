/**
 * Reusable **conformance suite** for any {@link PersistenceAdapter} (FR-12).
 *
 * A host that ships its own persistence adapter imports these cases and runs
 * them against its implementation to prove it honours the contract, exactly as
 * core runs them against the bundled {@link DevPersistenceAdapter}. The cases are
 * **test-framework-agnostic**: each is a plain async function that throws on
 * violation, so a host wraps them in its own `it()`/`test()` (vitest, jest, node
 * `test`, …) without core depending on any runner.
 *
 * @example
 * ```ts
 * import { test } from 'vitest';
 * import { persistenceConformanceCases } from '@gridmason/core/adapters';
 * import { MyPersistenceAdapter } from './my-adapter.js';
 *
 * for (const c of persistenceConformanceCases) {
 *   test(`persistence conformance: ${c.name}`, () => c.run(() => new MyPersistenceAdapter()));
 * }
 * ```
 *
 * Each case is handed a **factory** rather than a single adapter so every case
 * runs against a fresh, empty store — a shared adapter would let one case's
 * writes leak into another and mask isolation bugs.
 */
import type { LayoutPage } from '@gridmason/protocol';
import { CURRENT_LAYOUT_SCHEMA_VERSION } from '@gridmason/protocol';

import type { ScopeKey } from '../engine/layout/fork.js';

import type { PersistenceAdapter } from './persistence.js';

/** Builds a fresh, empty adapter for one conformance case. Sync or async. */
export type PersistenceAdapterFactory = () => PersistenceAdapter | Promise<PersistenceAdapter>;

/** One reusable conformance check: a name and an async runner that throws on failure. */
export interface PersistenceConformanceCase {
  /** Human-readable check name, e.g. `get-after-put`. */
  readonly name: string;
  /** Run the check against a fresh adapter from `makeAdapter`; throws on violation. */
  run(makeAdapter: PersistenceAdapterFactory): Promise<void>;
}

/** A distinct sample `LayoutPage` (`LayoutDoc`), tagged by `name` so docs compare unequal. */
function sampleDoc(name: string): LayoutPage {
  return {
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    page: 'crm.customer-detail',
    name,
    default: false,
    grid: { items: [{ widgetID: { source: 'local', tag: `acme-${name}` }, i: name, x: 0, y: 0, w: 4, h: 3 }] },
    hasTabs: false,
    tabs: [],
  };
}

/** Structural deep-equality — order-independent on object keys, so a host that reorders still passes. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  if (aKeys.length !== Object.keys(bo).length) return false;
  return aKeys.every((k) => Object.hasOwn(bo, k) && deepEqual(ao[k], bo[k]));
}

/** Throw a labelled assertion error when `condition` is false. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`persistence conformance: ${message}`);
}

/** Assert two documents are equal by value. */
function assertDocEqual(actual: LayoutPage | undefined, expected: LayoutPage, message: string): void {
  assert(actual !== undefined, `${message} — expected a document, got undefined`);
  assert(deepEqual(actual, expected), `${message} — stored and retrieved documents differ`);
}

const USER_KEY: ScopeKey = { owner: 'user', pageType: 'crm.customer-detail' };
const NODE_KEY: ScopeKey = { owner: { node: 'org-acme' }, pageType: 'crm.customer-detail' };
const ENTITY_KEY: ScopeKey = { owner: 'user', pageType: 'crm.customer-detail', entityId: 'cust-42' };

/**
 * The conformance cases. Import and run every one against a candidate adapter to
 * verify the {@link PersistenceAdapter} contract (get-after-put, `scopeKey`
 * isolation, missing-key, overwrite, delete).
 */
export const persistenceConformanceCases: readonly PersistenceConformanceCase[] = [
  {
    name: 'get-after-put returns the stored document',
    async run(makeAdapter) {
      const adapter = await makeAdapter();
      const doc = sampleDoc('alpha');
      await adapter.put(USER_KEY, doc);
      assertDocEqual(await adapter.get(USER_KEY), doc, 'get-after-put');
    },
  },
  {
    name: 'get of a never-written key resolves to undefined',
    async run(makeAdapter) {
      const adapter = await makeAdapter();
      assert((await adapter.get(USER_KEY)) === undefined, 'missing-key must resolve to undefined');
    },
  },
  {
    name: 'documents are isolated by scopeKey',
    async run(makeAdapter) {
      const adapter = await makeAdapter();
      const userDoc = sampleDoc('user');
      const nodeDoc = sampleDoc('node');
      const entityDoc = sampleDoc('entity');
      // Keys differ in every dimension: owner (user vs node) and entityId.
      await adapter.put(USER_KEY, userDoc);
      await adapter.put(NODE_KEY, nodeDoc);
      await adapter.put(ENTITY_KEY, entityDoc);
      assertDocEqual(await adapter.get(USER_KEY), userDoc, 'isolation: user scope');
      assertDocEqual(await adapter.get(NODE_KEY), nodeDoc, 'isolation: node scope');
      assertDocEqual(await adapter.get(ENTITY_KEY), entityDoc, 'isolation: entity scope');
    },
  },
  {
    name: 'put overwrites an existing document at the same key',
    async run(makeAdapter) {
      const adapter = await makeAdapter();
      await adapter.put(USER_KEY, sampleDoc('first'));
      const second = sampleDoc('second');
      await adapter.put(USER_KEY, second);
      assertDocEqual(await adapter.get(USER_KEY), second, 'overwrite');
    },
  },
  {
    name: 'delete removes a stored document and is a no-op when absent',
    async run(makeAdapter) {
      const adapter = await makeAdapter();
      // Deleting a never-written key must not throw.
      await adapter.delete(USER_KEY);
      await adapter.put(USER_KEY, sampleDoc('doomed'));
      await adapter.delete(USER_KEY);
      assert((await adapter.get(USER_KEY)) === undefined, 'delete must leave the key empty');
    },
  },
];
