---
'@gridmason/core': minor
---

Add the engine event model and consolidate the headless API surface. A tiny
typed, DOM-free `Emitter` (no DOM `EventTarget`/`CustomEvent`) carries the change
events SPEC §2 requires the engine to emit for the canvas: `WidgetCatalog`,
`PageTypeRegistry`, and the new `LayoutStore` each expose an `events` emitter and
publish register/unregister/clear, register, and load/replace changes
respectively. `LayoutStore` is the observable current-layout holder (the
LayoutManager half of the two-manager split) around `loadLayout`. The
`@gridmason/core/engine` barrel now re-exports the catalog, page-type registry,
layout operations + store, and the event model (`Emitter`, `EngineChangeEvent`)
as one documented public surface (`docs/engine-api.md`), and the entire engine
layer runs in a Node test env with zero DOM globals.
