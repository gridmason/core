# @gridmason/core

## 0.1.0

### Minor Changes

- a197ff8: Add the engine event model and consolidate the headless API surface. A tiny
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
- 1803af2: Add `loadLayout`, the engine-layer LayoutDoc load/normalize operation (FR-4). It
  runs the `@gridmason/protocol` migrate-on-read chain and reshapes the result for
  the host: an older-version document is upgraded in memory and flagged
  `migrated` so persistence writes the current version back, while a document
  newer than this build understands is returned untouched as `readOnly` with a
  `warning` for the canvas banner — never migrated, never rewritten.
- 3a49d73: Add the page-type registry (`PageTypeRegistry`) with typed context binding.
  Page-type descriptors register with an `id`, a typed `context` map, an optional
  `default_layout`, slot `locks`, and `allow_user_customization`; the declared
  context is validated against the `@gridmason/protocol` context-type grammar at
  registration time, so a malformed descriptor fails up front rather than at
  resolution or mount. A migration-only regex escape hatch (`pages`) is retained
  verbatim for porting POC route-regex pages (matched later by the picker's safe
  matcher, never `new RegExp(userInput)`).
- 580bc1b: Add the widget type catalog (`WidgetCatalog`): manifest-shaped registration keyed
  by source-qualified identity `(source, tag)`, define-time collision refusal (a
  second source claiming a bound tag, or a duplicate identity, is refused — never a
  crash), and a telemetry sink notified on every refusal (SPEC §4, FR-1).
