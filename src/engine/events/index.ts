/**
 * The engine event model (docs/SPEC.md §2).
 *
 * The engine is headless: it operates on `LayoutDoc` JSON and **emits change
 * events**; the canvas is the only DOM consumer. This module provides the
 * DOM-free {@link Emitter} those change events flow through, and consolidates the
 * per-domain change events into one {@link EngineChangeEvent} union so a host or
 * the canvas can reason about "an engine state change" uniformly.
 *
 * Each stateful engine surface owns its own typed {@link Emitter} rather than
 * sharing one global bus, so a subscriber attaches to exactly the source it
 * cares about and unsubscribes with it:
 *
 * - {@link WidgetCatalog.events} — {@link CatalogChangeEvent} (register / unregister / clear)
 * - {@link PageTypeRegistry.events} — {@link PageTypeChangeEvent} (register)
 * - {@link LayoutStore.events} — {@link LayoutChangeEvent} (load / replace)
 */
import type { CatalogChangeEvent } from '../catalog/index.js';
import type { PageTypeChangeEvent } from '../page-types/index.js';
import type { LayoutChangeEvent } from '../layout/store.js';

export { Emitter } from './emitter.js';
export type { Listener, Unsubscribe } from './emitter.js';

/**
 * Any engine change event, across every stateful surface — the discriminated
 * union of the catalog, page-type, and layout change events. Each member carries
 * a unique `type` string (`catalog:*`, `pageType:*`, `layout:*`), so a single
 * `switch (event.type)` handles them all exhaustively. Note this is a *type*
 * union for uniform handling; events are still emitted per-surface, not on one
 * shared emitter.
 */
export type EngineChangeEvent = CatalogChangeEvent | PageTypeChangeEvent | LayoutChangeEvent;
