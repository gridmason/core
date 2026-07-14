/**
 * Persistence adapter (docs/SPEC.md §2, §5, FR-12).
 *
 * Layout persistence is an **adapter**: the host implements storage; core never
 * performs I/O and makes zero network calls (SPEC §1, §8). The contract is a
 * keyed document store — `get`/`put`/`delete` on a {@link ScopeKey} — so any KV
 * backend fits (SPEC §5: "any KV store fits").
 *
 * The key is `(scope-node | user, pageType, entityId?)` — the {@link ScopeKey}
 * shape the engine's copy-on-write fork defines (`../engine/layout/fork.ts`,
 * issue #14). A forked personal copy is written under, and a reset-to-default
 * deletes, that scope's key; {@link scopeKeyString} gives the canonical,
 * order-independent string form suitable as a raw KV key. Those symbols are
 * re-exported here so a host implements this interface from one entry point
 * (`@gridmason/core/adapters`) without reaching into the engine.
 *
 * Methods are async (Promise-returning) so real backends — IndexedDB, a host
 * service, a remote KV — satisfy the contract directly; a synchronous store
 * (the bundled dev adapter, {@link DevPersistenceAdapter}) simply resolves
 * immediately.
 */
import type { LayoutPage } from '@gridmason/protocol';

import type { ScopeKey } from '../engine/layout/fork.js';

export type { ScopeKey, ScopeOwner } from '../engine/layout/fork.js';
export { scopeKeyString } from '../engine/layout/fork.js';

/**
 * The host persistence adapter: a scope-keyed store of {@link LayoutPage}
 * documents (`LayoutDoc`). The host implements it over any KV backend; core
 * only calls these three methods and never touches the DOM or network itself.
 *
 * Contract (exercised by {@link persistenceConformanceCases}):
 * - **get-after-put** — `get(k)` after `put(k, doc)` yields a document equal to
 *   `doc` (round-tripped by value; the returned object need not be the same
 *   reference).
 * - **scope isolation** — documents stored under distinct {@link ScopeKey}s (by
 *   {@link scopeKeyString}) never collide; reading one key never returns
 *   another's document.
 * - **missing-key** — `get` of a key never written (or one since `delete`d)
 *   resolves to `undefined`, never throws.
 */
export interface PersistenceAdapter {
  /**
   * Read the layout stored under `key`, or `undefined` if nothing is stored
   * there (a key never written, or deleted). Never throws for a missing key.
   */
  get(key: ScopeKey): Promise<LayoutPage | undefined>;
  /**
   * Store `doc` under `key`, replacing any existing document. Used to persist a
   * copy-on-write fork and every subsequent edit at that scope (SPEC §5).
   */
  put(key: ScopeKey, doc: LayoutPage): Promise<void>;
  /**
   * Delete any document stored under `key` — the persistence side of
   * reset-to-default (SPEC §5, FR-5), which drops a level's personal layout so
   * resolution falls back to the upstream document. A no-op when nothing is
   * stored there.
   */
  delete(key: ScopeKey): Promise<void>;
}
