# `@gridmason/core` — headless engine API surface

The **engine** is the headless, DOM-free half of `@gridmason/core` (SPEC §2). It
operates on `LayoutDoc` JSON and **emits change events**; the canvas layer is the
only DOM consumer. Nothing here touches `window`, `document`, `customElements`,
or `EventTarget` — the whole layer runs in a plain Node environment with zero DOM
globals (GW-D20), and a guard test fails the suite if that ever regresses.

This document maps the public surface a host or the canvas consumes. Import it
from the engine subpath:

```ts
import {
  WidgetCatalog,
  PageTypeRegistry,
  LayoutStore,
  loadLayout,
  Emitter,
} from '@gridmason/core/engine';
```

Every entry point is documented with TSDoc on its exported symbol; this file is
the map and the change-event catalog.

## The event model

The engine surfaces state changes through a tiny typed, DOM-free emitter rather
than DOM `CustomEvent`s. Each stateful surface **owns its own emitter** (exposed
as a public `events` field) rather than sharing one global bus, so a subscriber
attaches to exactly the source it cares about and unsubscribes with it.

### `Emitter<EventMap>`

A synchronous pub/sub over a typed event map — an object type (commonly an
`interface`) whose keys are event names and whose values are the payload for that
event.

| Member | Signature | Behavior |
|---|---|---|
| `on` | `on(type, listener) → Unsubscribe` | Subscribe. Returns an idempotent unsubscribe. The same listener added twice is held once (set semantics). |
| `once` | `once(type, listener) → Unsubscribe` | Subscribe for a single event, then auto-remove. Removed **before** it runs, so a re-entrant emit does not re-invoke it. |
| `off` | `off(type, listener) → void` | Remove a listener; no-op if never subscribed. |
| `emit` | `emit(type, event) → void` | Deliver synchronously, in subscription order, to a **snapshot** of listeners — subscribing/unsubscribing during delivery does not affect the in-flight emit. |
| `listenerCount` | `listenerCount(type) → number` | Current subscriber count for a type. |
| `clear` | `clear() → void` | Drop every subscription across all types. |

`Listener<Event>` is `(event: Event) => void`; `Unsubscribe` is `() => void`.

### `EngineChangeEvent`

The discriminated union of every engine change event across all surfaces
(`CatalogChangeEvent | PageTypeChangeEvent | LayoutChangeEvent`). Each member
carries a unique `type` string, so a single `switch (event.type)` handles them
exhaustively. This is a **type** for uniform handling — events are still emitted
per-surface, not on one shared emitter.

## Widget catalog — `WidgetCatalog`

The source-qualified registry of the widget *types* a host has loaded (SPEC §4,
FR-1). One instance models one document's tag namespace; identity is
`(source, tag)`, never a bare tag.

| Method | In → Out | Notes |
|---|---|---|
| `new WidgetCatalog(options?)` | `{ telemetry? }` | `telemetry` receives every registration **refusal**. |
| `register` | `(source, manifest) → CatalogRegistration` | Never throws; a bad/colliding manifest is a value (`{ ok: false, event }`). Emits `catalog:registered` on success. |
| `get` / `has` | `(id) → entry? / boolean` | Exact `(source, tag)` lookup. |
| `getByTag` | `(tag) → entry?` | Resolves a bare tag to its single owning source. |
| `unregister` | `(id) → boolean` | Emits `catalog:unregistered` when it removes an entry. |
| `list` | `() → readonly entry[]` | Ordered by identity, deterministic. |
| `clear` | `() → void` | Emits `catalog:cleared`. |
| `size` | `number` | Count of registered types. |
| `events` | `Emitter<CatalogEventMap>` | Change events (below). |

**Refusals vs. change events.** A refused registration is *not* a change event —
it is surfaced through the `telemetry` sink as a `CatalogRefusalEvent` and
returned from `register`. Change events fire only for actual state changes.

Change events (`CatalogChangeEvent`):

| `type` | Payload | Emitted when |
|---|---|---|
| `catalog:registered` | `{ entry }` | `register` succeeds |
| `catalog:unregistered` | `{ id, entry }` | `unregister` removes an entry |
| `catalog:cleared` | `{}` | `clear` runs |

## Page-type registry — `PageTypeRegistry`

The registry of page-type descriptors (SPEC §3, FR-2/FR-3). Every route renders a
page canvas; a page type declares the typed context that canvas provides, its
default layout, its locks, and whether users may customize it. Context conformance
is validated at registration time against the `@gridmason/protocol` grammar.

| Method | In → Out | Notes |
|---|---|---|
| `register` | `(input: PageTypeInput) → RegisteredPageType` | **Throws** `PageTypeRegistrationError` on an invalid/duplicate id or malformed context/locks/pages. Emits `pageType:registered` on success. |
| `get` / `has` | `(id) → pageType? / boolean` | By id. |
| `list` | `() → readonly pageType[]` | Registration order. |
| `events` | `Emitter<PageTypeEventMap>` | Change events (below). |

A fully locked ("fixed") page is just `allow_user_customization: false` — there is
no separate kind. The legacy route-regex `pages` escape hatch is retained on the
descriptor for migration; the engine never compiles it.

Change events (`PageTypeChangeEvent`):

| `type` | Payload | Emitted when |
|---|---|---|
| `pageType:registered` | `{ pageType }` | `register` succeeds (a rejected descriptor throws and emits nothing) |

## Layout operations — `loadLayout` and `LayoutStore`

### `loadLayout(doc, options?) → LoadLayoutResult`

The pure migrate-on-read entry point (SPEC §5, FR-4). Reads a persisted
`LayoutDoc` at any known `schemaVersion` and returns either a loadable document or
a read-only signal. Never throws on a version-negotiation ground; never mutates
the input.

- **Loadable** (`readOnly: false`): `{ doc, migrated, loadedFrom }`. `migrated`
  is `true` when the document was upgraded — the persistence layer should write
  `doc` back so storage advances; `false` means it was already current and must
  not be rewritten.
- **Read-only** (`readOnly: true`): `{ doc, warning, loadedFrom }`. The document
  is newer than this build understands (or needs a migrator it lacks); it is
  returned **untouched** with a warning for the canvas's read-only banner. No
  rewrite, no destructive downgrade.

`options` — `{ registry?, target? }` — mirror the protocol migrate surface. The
migrate-on-read framework itself (`MigratorRegistry`, `layoutMigrators`,
`CURRENT_LAYOUT_SCHEMA_VERSION`) is owned by `@gridmason/protocol` and re-surfaced
through this barrel for convenience.

### `LayoutStore`

The observable current-layout holder — the LayoutManager half of the POC's
two-manager split (SPEC §2). `loadLayout` is pure and stateless; `LayoutStore`
adds the piece SPEC §2 asks of the engine: it holds the page's current document
and emits a change event whenever it changes, so the canvas re-renders off the
event instead of polling.

It is deliberately thin — it stores and swaps whole documents. It does **not**
resolve governance layers (`resolveLayout`, C-E2) and does **not** compute
granular edit-mode mutations (add/move/remove a widget, C-E3); the canvas computes
a mutated document and hands it back via `replace`.

| Method | In → Out | Notes |
|---|---|---|
| `new LayoutStore()` | — | Starts empty: `current` is `undefined`, `readOnly` is `false`. |
| `load` | `(doc, options?) → LoadLayoutResult` | Runs `loadLayout`, adopts the result, emits `layout:loaded`. A read-only-on-newer result leaves `current` `undefined` and sets `readOnly`. |
| `replace` | `(doc: LayoutPage) → void` | Swaps the current document wholesale, clears read-only, emits `layout:changed`. |
| `current` | `LayoutPage \| undefined` | The render-ready document, or `undefined` before a load / when read-only. |
| `readOnly` | `boolean` | Whether the last `load` was read-only-on-newer. |
| `events` | `Emitter<LayoutStoreEventMap>` | Change events (below). |

Change events (`LayoutChangeEvent`):

| `type` | Payload | Emitted when |
|---|---|---|
| `layout:loaded` | `{ result }` | `load` runs (`result` is the full `LoadLayoutResult`) |
| `layout:changed` | `{ doc }` | `replace` runs |

## Scope

This surface is the headless engine: the catalog, page-type registry, layout
operations, the event model, first-fit placement, and the widget picker. The
`placement` slot supplies first-fit auto-placement (`placeFirstFit` /
`firstFitPosition`), and the `picker` slot supplies add-widget eligibility
(`eligibleWidgets` / `isWidgetEligible`) plus resolution-time gating
(`gateResolvedLayout` / `resolveAndGateLayout`) and layout export/import
(`exportLayout` / `importLayout`). The gridstack-bound canvas is documented
separately in `docs/canvas-abi.md`.
