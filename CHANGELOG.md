# @gridmason/core

## 0.2.0

### Minor Changes

- 5429a28: Add copy-on-write fork + reset-to-default per level (FR-5, SPEC §5), the write
  side of the three-level governance model. `forkOnEdit(inherited, edited)` decides
  whether a user's edit of an inherited layout genuinely differs from what they were
  viewing: if so it returns a detached personal copy to store at the user level, and
  if not the user keeps inheriting. `resetLevel(inputs, level)` drops a level's
  personal layout so resolution falls back to the upstream document, preserving any
  governance locks the level declared. The fork decision runs on a new **structural
  diff** (`layoutsEqual` / `gridsEqual` / `structuralEqual`) that replaces the POC's
  `JSON.stringify` hash: it is insensitive to object key order and to item ordering
  within a grid, so reloading and re-serializing an inherited layout never spuriously
  forks. The persistence `ScopeKey` shape `(scope-node | user, pageType, entityId?)`
  and its canonical `scopeKeyString` are defined here (the adapter itself is C-E4).
  All operations are pure and DOM-free, surfaced through `@gridmason/core/engine`.
- 9c6931c: Add add-widget picker gating (FR-6, SPEC §6). `eligibleWidgets` returns the
  catalog entries a page admits, and `isWidgetEligible` — the reusable predicate
  layout resolution (FR-7) shares — evaluates all four checks: `requiresContext` ⊆
  page context (typed subset via the protocol's `isContextSubset`), `supportsPages`
  glob match, gate on, and permission held. Core owns the two typed checks and
  orchestrates the gate/permission checks through minimal host ports; a widget
  failing any check is **absent, not greyed**, leaking no capability. Glob matching
  uses a new dependency-free safe matcher (`matchGlob`/`matchAnyGlob`) that
  constructs no RegExp, so a hostile pattern cannot inject or induce catastrophic
  backtracking (SPEC §8).
- 0f39b8e: Add resolution-time gating (FR-7, SPEC §6): the add-widget picker's four checks
  now re-run on a resolved layout's **persisted** instances via the shared
  `isWidgetEligible` predicate. `gateResolvedLayout` takes an `EffectiveLayout`
  (plus the page, a `WidgetManifestSource`, and the same gate/permission ports the
  picker uses) and returns a new effective layout with every instance that is now
  gated off, unpermitted, or context/`supportsPages`-mismatched **silently
  omitted** — no named placeholder, so no capability leaks. Omission is a view-time
  filter, never a write: the saved `LayoutDoc` is untouched, so re-enabling a gate
  or restoring a permission includes the instance again on the next resolution (a
  lossless round-trip). An instance whose type the host cannot resolve is a _load
  failure_, kept for the C-E3 fallback card rather than omitted. `resolveAndGateLayout`
  composes governance resolution and gating in one pure, DOM-free call.
- 5485d03: Add `resolveLayout`, the engine-layer 3-level layout resolution + governance
  function (FR-5, SPEC §5). It composes up to three candidate layouts — plugin/host
  default, organization published layout, and user personal layout — into one
  `EffectiveLayout` under the two governance rules: **most-specific wins** (the
  user level overrides org, which overrides default, on a per-slot/per-item basis)
  and **locked slots merge down** (a slot locked at the default or org level is
  fixed for every level below the one that locked it, so a lower level's attempt to
  move, resize, remove, or replace it is ignored). Each level supplies its own
  locks — the default level's from the page-type descriptor, the org level's from
  the locks it added on publish — and the result reports the effective `lockedSlots`
  for the canvas and gating. The function is pure and DOM-free: it never mutates its
  inputs and performs no I/O. Copy-on-write forking and reset-to-default (also FR-5)
  remain a sibling operation.

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
