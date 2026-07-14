/**
 * Page-type registry + typed context binding (docs/SPEC.md §3, FR-2/FR-3).
 *
 * Every route in Gridmason renders a page canvas; a *page type* is the
 * descriptor that declares which typed context that canvas provides, which
 * designed layout it starts from, which slots are pinned, and whether end users
 * may customize it. There is no separate "fixed page" kind — a fully locked
 * page is simply `allow_user_customization: false` (SPEC §3).
 *
 * This module is engine-layer and DOM-free (SPEC §2): it models descriptors and
 * validates their declared context against the protocol context-type grammar. It
 * consumes the context types from `@gridmason/protocol`; it neither defines them
 * nor renders anything. Context conformance is checked at *registration* time,
 * so a malformed descriptor fails here — with a clear error — rather than later
 * at layout resolution or widget mount.
 *
 * Relationship to `@gridmason/protocol`: the wire-level `PageTypeDescriptor`
 * projects a page's context to `{ recordType? }` per slot (a lossy manifest
 * shorthand). The engine keeps the *full* {@link ContextMap} grammar here,
 * because that is what picker gating and layout resolution match against via the
 * protocol's `isContextSubset` (SPEC §3.2, core §6). Field names (`default_layout`,
 * `locks`, `allow_user_customization`) follow the protocol descriptor.
 */
import type { ContextMap } from '@gridmason/protocol';

import { Emitter } from '../events/emitter.js';

/**
 * A page-type descriptor as supplied to {@link PageTypeRegistry.register}. This
 * is the engine's registration input; the registry validates and normalizes it
 * into a {@link RegisteredPageType}.
 */
export interface PageTypeInput {
  /** Page-type identity, e.g. `crm.customer-detail`. Unique within a registry. */
  readonly id: string;
  /**
   * Typed context this page provides to the widgets placed on it, keyed by slot
   * name (e.g. `record: { type: 'record-ref', recordType: 'customer' }`). The
   * full protocol context grammar; validated at registration time.
   */
  readonly context: ContextMap;
  /** Tag or path of the layout applied to new instances of this page type. */
  readonly default_layout?: string;
  /**
   * Slot ids the page type pins so user customization cannot move or remove
   * them. Retained on the descriptor for the resolution layer (C-E2) to consume.
   */
  readonly locks?: readonly string[];
  /**
   * Whether end users may add, move, or remove widgets on this page type.
   * Defaults to `false` (a fully locked page) when omitted — customization is
   * opt-in.
   */
  readonly allow_user_customization?: boolean;
  /**
   * Migration-only regex escape hatch: legacy POC route-regex `pages` patterns
   * (e.g. `['.*']`), retained verbatim so a POC page can be ported without
   * rewriting its route match up front. This engine never compiles them — the
   * picker/gating layer matches them through a safe matcher and MUST NOT pass
   * them to `new RegExp(userInput)` (SPEC §8). Prefer typed context + glob
   * `supportsPages` for new page types.
   */
  readonly pages?: readonly string[];
}

/**
 * A registered, validated, and normalized page type. `locks` and
 * `allow_user_customization` are always present (defaulted during
 * registration); optional fields are omitted rather than set to `undefined`.
 */
export interface RegisteredPageType {
  readonly id: string;
  readonly context: ContextMap;
  readonly default_layout?: string;
  readonly locks: readonly string[];
  readonly allow_user_customization: boolean;
  readonly pages?: readonly string[];
}

/**
 * Raised when a page-type descriptor fails validation at registration time —
 * an invalid id, a duplicate id, a malformed context declaration, or a
 * malformed `locks`/`pages` list.
 */
export class PageTypeRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageTypeRegistrationError';
  }
}

/** The context-type discriminants the protocol grammar recognises (SPEC §3.2). */
const KNOWN_CONTEXT_TYPES = ['record-ref', 'string', 'number', 'bool', 'id', 'list', 'object'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate that `value` conforms to the protocol {@link ContextType} grammar,
 * throwing a {@link PageTypeRegistrationError} that names the offending path.
 * Recurses through `list` elements and `object` fields.
 */
function validateContextType(value: unknown, path: string): void {
  if (!isPlainObject(value)) {
    throw new PageTypeRegistrationError(`context '${path}' must be a context-type object`);
  }
  const type = value.type;
  switch (type) {
    case 'record-ref': {
      const recordType = value.recordType;
      if (typeof recordType !== 'string' || recordType.length === 0) {
        throw new PageTypeRegistrationError(
          `context '${path}' of type 'record-ref' requires a non-empty 'recordType' string`,
        );
      }
      return;
    }
    case 'string':
    case 'number':
    case 'bool':
    case 'id':
      return;
    case 'list': {
      if (value.element === undefined) {
        throw new PageTypeRegistrationError(`context '${path}' of type 'list' requires an 'element' type`);
      }
      validateContextType(value.element, `${path}.element`);
      return;
    }
    case 'object': {
      if (!isPlainObject(value.fields)) {
        throw new PageTypeRegistrationError(`context '${path}' of type 'object' requires a 'fields' map`);
      }
      validateContextMap(value.fields, path);
      return;
    }
    default:
      throw new PageTypeRegistrationError(
        `context '${path}' has unknown type ${JSON.stringify(type)}; expected one of ${KNOWN_CONTEXT_TYPES.join(', ')}`,
      );
  }
}

/** Validate every slot of a context map. `basePath` is `''` at the top level. */
function validateContextMap(context: Record<string, unknown>, basePath: string): void {
  for (const [key, value] of Object.entries(context)) {
    validateContextType(value, basePath === '' ? key : `${basePath}.${key}`);
  }
}

/** Validate the descriptor's non-context fields, throwing on any violation. */
function assertDescriptorShape(input: PageTypeInput): void {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new PageTypeRegistrationError('page type descriptor requires a non-empty string id');
  }
  if (!isPlainObject(input.context)) {
    throw new PageTypeRegistrationError(`page type '${input.id}' must declare a 'context' map`);
  }
  if (input.default_layout !== undefined && typeof input.default_layout !== 'string') {
    throw new PageTypeRegistrationError(`page type '${input.id}' 'default_layout' must be a string`);
  }
  if (input.locks !== undefined) {
    assertStringList(input.locks, `page type '${input.id}' 'locks'`);
  }
  if (input.allow_user_customization !== undefined && typeof input.allow_user_customization !== 'boolean') {
    throw new PageTypeRegistrationError(`page type '${input.id}' 'allow_user_customization' must be a boolean`);
  }
  if (input.pages !== undefined) {
    assertStringList(input.pages, `page type '${input.id}' 'pages'`);
  }
}

/** Assert `value` is an array of non-empty strings. */
function assertStringList(value: readonly unknown[], label: string): void {
  if (!Array.isArray(value)) {
    throw new PageTypeRegistrationError(`${label} must be an array of strings`);
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new PageTypeRegistrationError(`${label} must contain only non-empty strings`);
    }
  }
}

/** Freeze the validated input into a normalized {@link RegisteredPageType}. */
function normalize(input: PageTypeInput): RegisteredPageType {
  return {
    id: input.id,
    context: input.context,
    locks: input.locks ?? [],
    allow_user_customization: input.allow_user_customization ?? false,
    ...(input.default_layout !== undefined ? { default_layout: input.default_layout } : {}),
    ...(input.pages !== undefined ? { pages: input.pages } : {}),
  };
}

/**
 * A page type was registered: emitted after {@link PageTypeRegistry.register}
 * validates and stores a descriptor. A rejected descriptor throws
 * {@link PageTypeRegistrationError} and emits nothing.
 */
export interface PageTypeRegisteredEvent {
  readonly type: 'pageType:registered';
  /** The normalized page type that was added. */
  readonly pageType: RegisteredPageType;
}

/**
 * A change to the page-type registry's contents. Subscribe via
 * {@link PageTypeRegistry.events}. Registration is the only mutation, so this is
 * currently a single-member union — it stays a union so future mutations extend
 * it without a breaking rename.
 */
export type PageTypeChangeEvent = PageTypeRegisteredEvent;

/** The typed event map of {@link PageTypeRegistry.events}, keyed by {@link PageTypeChangeEvent} `type`. */
export interface PageTypeEventMap {
  'pageType:registered': PageTypeRegisteredEvent;
}

/**
 * An in-memory registry of page types (SPEC §3). Hosts (and plugins) register
 * their page-type descriptors; the registry validates each one — including its
 * typed context — at registration time, so a malformed descriptor is rejected
 * up front rather than failing later during layout resolution or widget mount.
 */
export class PageTypeRegistry {
  readonly #pageTypes = new Map<string, RegisteredPageType>();

  /**
   * Change events for the registry's contents (SPEC §2: the engine emits change
   * events; the canvas is the only DOM consumer). Emits {@link PageTypeRegisteredEvent}
   * after a successful {@link register}.
   */
  readonly events: Emitter<PageTypeEventMap> = new Emitter<PageTypeEventMap>();

  /**
   * Validate and register a page-type descriptor. Returns the normalized,
   * registered page type.
   *
   * @throws {PageTypeRegistrationError} if the id is missing/duplicate, the
   *   context does not conform to the protocol context grammar, or a
   *   `locks`/`pages` list is malformed.
   */
  register(input: PageTypeInput): RegisteredPageType {
    assertDescriptorShape(input);
    if (this.#pageTypes.has(input.id)) {
      throw new PageTypeRegistrationError(`a page type with id '${input.id}' is already registered`);
    }
    validateContextMap(input.context, '');
    const registered = normalize(input);
    this.#pageTypes.set(registered.id, registered);
    this.events.emit('pageType:registered', { type: 'pageType:registered', pageType: registered });
    return registered;
  }

  /** The registered page type for `id`, or `undefined` if none is registered. */
  get(id: string): RegisteredPageType | undefined {
    return this.#pageTypes.get(id);
  }

  /** Whether a page type is registered under `id`. */
  has(id: string): boolean {
    return this.#pageTypes.has(id);
  }

  /** All registered page types, in registration order. */
  list(): readonly RegisteredPageType[] {
    return [...this.#pageTypes.values()];
  }
}
