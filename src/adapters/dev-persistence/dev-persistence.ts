/**
 * Bundled **dev-only** persistence adapter (docs/SPEC.md §2, §5, FR-12).
 *
 * ⚠️ NOT FOR PRODUCTION. This is a convenience implementation of
 * {@link PersistenceAdapter} for local development, demos, and stories: it keeps
 * layouts in-memory and, when a `Storage` (browser `localStorage`) is available,
 * mirrors them there so they survive a reload. It has **no durability, no
 * multi-user isolation, no server, and no migration story** — a real host must
 * ship its own persistence adapter. To make an accidental production ship
 * impossible to miss, every instance **warns loudly** on construction (SPEC §5:
 * "dev-only and clearly labeled").
 *
 * It is an adapter, not engine code (SPEC §2: the engine never touches the DOM);
 * `localStorage` access lives here, behind a feature-detect, so importing the
 * engine never reaches for a browser global. Values round-trip through JSON, so
 * a returned document is always a fresh copy — a caller mutating it never
 * corrupts the store, matching how a real KV backend behaves.
 */
import type { LayoutPage } from '@gridmason/protocol';

import type { ScopeKey } from '../../engine/layout/fork.js';
import { scopeKeyString } from '../../engine/layout/fork.js';
import type { PersistenceAdapter } from '../persistence.js';

/** Default key namespace for `Storage`-backed dev persistence. */
export const DEV_PERSISTENCE_NAMESPACE = 'gridmason:dev-persistence:';

/**
 * The banner every {@link DevPersistenceAdapter} logs on construction. Exported
 * so tests can assert the loud warning fires, and so a host can grep for it.
 */
export const DEV_PERSISTENCE_WARNING =
  '[gridmason] DevPersistenceAdapter is DEV-ONLY (in-memory + localStorage) and MUST NOT be used in production — ' +
  'it has no durability, isolation, or migration. Ship a real PersistenceAdapter.';

/** A minimal string KV the dev adapter serializes documents through. */
interface KvBacking {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** In-memory backing: a `Map`, used when no usable `Storage` is available. */
class MemoryBacking implements KvBacking {
  readonly #map = new Map<string, string>();
  read(key: string): string | null {
    return this.#map.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.#map.set(key, value);
  }
  remove(key: string): void {
    this.#map.delete(key);
  }
}

/** `Storage`-backed KV (browser `localStorage`), namespaced by prefix. */
class StorageBacking implements KvBacking {
  readonly #storage: Storage;
  readonly #prefix: string;
  constructor(storage: Storage, prefix: string) {
    this.#storage = storage;
    this.#prefix = prefix;
  }
  read(key: string): string | null {
    return this.#storage.getItem(this.#prefix + key);
  }
  write(key: string, value: string): void {
    this.#storage.setItem(this.#prefix + key, value);
  }
  remove(key: string): void {
    this.#storage.removeItem(this.#prefix + key);
  }
}

/** Options for {@link DevPersistenceAdapter}. All optional; defaults auto-detect. */
export interface DevPersistenceOptions {
  /**
   * Explicit `Storage` to back the adapter (e.g. `window.localStorage` or
   * `sessionStorage`). Omit to auto-detect `globalThis.localStorage`.
   */
  readonly storage?: Storage;
  /**
   * Force in-memory backing even when a `Storage` is available — for SSR, tests,
   * or an ephemeral store. When true, `storage` is ignored.
   */
  readonly inMemory?: boolean;
  /** Key namespace prefix for `Storage` backing. Defaults to {@link DEV_PERSISTENCE_NAMESPACE}. */
  readonly namespace?: string;
  /**
   * Where the dev-only warning is written. Defaults to `console.warn`. Provided
   * as a seam for tests and custom logging — it does **not** suppress the
   * warning (a host cannot silently opt out of the dev-only banner).
   */
  readonly warn?: (message: string) => void;
}

/**
 * Probe whether a `Storage` is usable — present *and* writable. Browsers in
 * private mode expose `localStorage` but throw on `setItem`; a failed probe
 * falls back to in-memory rather than crashing.
 */
function usableStorage(storage: Storage | undefined): storage is Storage {
  if (storage === undefined) return false;
  const probe = `${DEV_PERSISTENCE_NAMESPACE}__probe__`;
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Read `globalThis.localStorage` without throwing where it is undefined (Node). */
function ambientLocalStorage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

/**
 * A dev-only {@link PersistenceAdapter}: in-memory, mirrored to `localStorage`
 * when one is usable. Warns loudly on construction. See the module doc — **not
 * for production**.
 */
export class DevPersistenceAdapter implements PersistenceAdapter {
  readonly #backing: KvBacking;

  constructor(options: DevPersistenceOptions = {}) {
    const warn = options.warn ?? ((message: string) => { console.warn(message); });
    warn(DEV_PERSISTENCE_WARNING);

    const prefix = options.namespace ?? DEV_PERSISTENCE_NAMESPACE;
    const candidate = options.inMemory === true ? undefined : (options.storage ?? ambientLocalStorage());
    this.#backing = usableStorage(candidate) ? new StorageBacking(candidate, prefix) : new MemoryBacking();
  }

  get(key: ScopeKey): Promise<LayoutPage | undefined> {
    const raw = this.#backing.read(scopeKeyString(key));
    return Promise.resolve(raw === null ? undefined : (JSON.parse(raw) as LayoutPage));
  }

  put(key: ScopeKey, doc: LayoutPage): Promise<void> {
    this.#backing.write(scopeKeyString(key), JSON.stringify(doc));
    return Promise.resolve();
  }

  delete(key: ScopeKey): Promise<void> {
    this.#backing.remove(scopeKeyString(key));
    return Promise.resolve();
  }
}
