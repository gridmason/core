# @gridmason/core

## 0.5.3

### Patch Changes

- 0337250: Fix WCAG AA colour-contrast on the widget fallback/error card and make the boundary palette host-themeable.

  The fallback card background is now opaque (`#fef2f2`) instead of translucent, so its text contrast no longer depends on the host backdrop, and the message line drops its `opacity` blend — every text pair on the card (title, message, retry) now clears WCAG AA (4.5:1) with no host CSS. Every boundary colour is exposed as a CSS custom property with these AA defaults as fallbacks (`--gm-fallback-bg`, `--gm-fallback-border`, `--gm-fallback-title-color`, `--gm-fallback-message-color`, `--gm-retry-bg`, `--gm-retry-color`, `--gm-retry-border`, `--gm-retry-focus-outline`, and the skeleton tones `--gm-skeleton-bg`, `--gm-skeleton-bar-base`, `--gm-skeleton-bar-highlight`) so a host can theme the card to its design system.

## 0.5.2

### Patch Changes

- 43ad6a0: Auto-recover a widget whose custom-element tag is undefined at mount once the tag is defined later (#79). A layout can legitimately render before a widget's `customElements.define` runs (a slow or code-split widget bundle), which fell the widget back to a permanent `unresolved` "unavailable" card that never re-upgraded even after the tag was registered. The boundary now waits on `customElements.whenDefined(tag)` and, once the tag is defined, re-mounts the widget on the same path as a manual retry — upgrading the card to the live widget with no user action — and emits a `widget.recovery` telemetry event so a host can observe the layout-before-define race healing. Recovery is scoped to this failure: a widget that threw, reported an error, or timed out is not re-mounted on a define (only its manual retry re-runs it), the subscription is made once per boundary (no stacking across failed retries), and a boundary unmounted before the define resolves is left torn down.

## 0.5.1

### Patch Changes

- cd671f3: Fix `<gm-page-canvas>` widgets rendering collapsed to content width on their first client-side mount (#63). When an SPA host mounts the canvas into a freshly-attached container and drives it imperatively, gridstack places the items before the browser has laid the containing block out, so each item's percentage width (`calc(w * var(--gs-column-width))`) resolves as `auto` and Chromium keeps that stale resolution until a much later reflow (a ~1.5s self-correct or a window resize). The canvas now watches the grid host for its first real layout box (a one-shot `ResizeObserver`) and, once it has one, re-resolves the item widths by cycling gridstack's `--gs-column-width` property on the host — so items are correctly sized on first paint with no resize crutch. The fix is inert where the box is already laid out (SSR/static) and where `ResizeObserver` is unavailable; render, mount, and `gm:rendered` timing are unchanged.

## 0.5.0

### Minor Changes

- ce7da31: Announce widget-boundary state changes to assistive technology (SPEC §7, FR-9/FR-10). The per-widget error boundary now speaks the transitions a screen-reader user needs to hear — a widget becoming unavailable (its fallback card), an auto-degrade on latency, and a post-retry recovery — through an opt-in `announce` sink on the boundary config, surfaced on `PageCanvas` as the `boundaryAnnounce` property. A host typically routes it to the same `LiveAnnouncer` the edit-mode a11y layer uses (`canvas.boundaryAnnounce = (m) => announcer.announce(m)`), so one live region serves both. First loads and plain skeleton→ready transitions stay silent to avoid chatter; announcements use only the host-resolved display name (never a tag — SPEC §6/§8). When the sink is wired, the fallback card's inline `role="alert"` is dropped so the failure is not announced twice.
- 1704a89: **BREAKING** (event discriminator): rename `CatalogRefusalEvent.type` from `'catalog.register.refused'` (dots) to `'catalog:register:refused'` (colons), aligning it with every other engine event discriminator (`catalog:registered`, `pageType:registered`, `layout:loaded`). A host that switches or filters telemetry on the literal `'catalog.register.refused'` string — including via `@gridmason/core/adapters` `TelemetryEvent` — must update that comparison to `'catalog:register:refused'`. The event's shape, payload, and emission points are otherwise unchanged. Shipped in `@gridmason/core@0.1.0`; per the 0.x changesets convention this discriminator change is released as a `minor`.

## 0.4.0

### Minor Changes

- 2d6abcd: Add the host adapter surface (`@gridmason/core/adapters`, FR-12). Five interfaces the host implements — persistence (`get`/`put`/`delete` a `LayoutDoc` by `ScopeKey`), gates, permissions, telemetry (per-widget error + latency attribution), and settings-form (JSON-schema fallback form) — with the engine's minimal gate/permission ports and the catalog refusal telemetry reconciled into them. Ships a bundled **dev-only** `DevPersistenceAdapter` (in-memory + `localStorage`) that warns loudly at construction, plus a reusable, framework-agnostic `persistenceConformanceCases` suite a host can run against its own persistence adapter.
- 00eafd9: Add layout export/import + anonymous unavailable-widget degradation (`@gridmason/core/engine` IO, FR-13/FR-16). `exportLayout` serializes a `LayoutDoc` to JSON; `importLayout` parses and schema-validates untrusted JSON (via `validateLayoutDoc`) before any use — malformed input is rejected whole, never partially applied. `degradeUnavailableWidgets` projects a layout to its renderable form: every placed widget this instance cannot render (checked against the catalog with `catalogAvailability`, exact source-qualified identity per SPEC §4) collapses to the shared anonymous `UNAVAILABLE_WIDGET_ID` placeholder — so the canvas renders a generic "Unavailable widget" card that echoes no tag, name, or props in the DOM or in any telemetry event, and the original document is kept untouched so an instance restores losslessly when its widget appears. Enforces the §8 security posture: JSON-in only, no `<script>`/URL/base64 import path, no `new RegExp(userInput)`, and zero network calls (guarded by an executable check over the IO sources).
- 1c7b5ef: Wire the `s7k-widgets-core` POC importer (`@gridmason/core/engine` IO, FR-14; protocol FR-6). `importPocLayouts` takes a raw `$widgetLayouts` localStorage dump (the JSON string the proof-of-concept persisted), converts each legacy page into a current-version `LayoutDoc` via `@gridmason/protocol`'s importer contract — source-qualifying every bare POC `widgetID` to `{ source: 'local', tag }` (SPEC §4), carrying `{x,y,w,h,i}` geometry and per-instance `props`, and dropping the POC's node uuids and `name`/`moved` fields — then runs each converted doc through the migrate-on-read pipeline (`loadLayout`) to the current `schemaVersion`. Totally typed: not-JSON returns `invalid-json`, a malformed payload returns the converter's typed error, and a doc the chain cannot upgrade returns `read-only`, never a throw or a partial apply, and with no network call. Ships `POC_DEMO_PAGE_TYPE` (the demo page type the imported layouts render on) and `toRenderablePocLayout` (pure resolve + anonymous unavailable-widget degradation projection for the canvas), plus a checked-in real POC export at `fixtures/s7k-widgets-core/` proven end to end: the dump renders on the demo page type, and a POC widget with no catalog match degrades to the anonymous "Unavailable widget" card — not a crash — with no tag/name/props echoed into the DOM or telemetry.

## 0.3.0

### Minor Changes

- 5f3dc07: feat(canvas): edit mode — drag/resize/add/remove/tabs with copy-on-write persistence (FR-9)

  Adds the `edit-mode` submodule of the canvas layer (`@gridmason/core/canvas`): an
  `EditController` that drives an authoring session over a `PageCanvas`. Entering
  edit mode enables gridstack drag/resize; the controller folds settled user
  edits — surfaced by the canvas as a new `gm:geometry-change` event — back into
  the layout, and offers add (first-fit placement via the engine, gated by the
  C-E2 picker checks), remove, and tab create/rename/switch. Every edit forks a
  personal copy on the first genuine change (copy-on-write, FR-5) and is written
  back through a `LayoutPersistencePort` (`put(scopeKey, doc)`, a subset of the
  C-E4 persistence adapter); locked slots are never offered a move/resize/remove
  (SPEC §5). Also fills the engine `placement` module with first-fit auto-placement
  (`placeFirstFit`/`firstFitPosition`), and `PageCanvas` now emits
  `CANVAS_GEOMETRY_CHANGE_EVENT` for user drag/resize. The keyboard alternative +
  a11y announcements (#19), the per-widget error boundary (#20), and virtualization

  - debounced writes (#21) are sibling C-E3 issues that build on this.

- d781be9: feat(canvas): keyboard alternative + a11y landmarks + live-region announcements (FR-9)

  Adds the `edit-mode/a11y` layer of the canvas (`@gridmason/core/canvas`) so the
  canvas holds WCAG 2.1 AA in edit mode. A `CanvasKeyboardController` gives every
  pointer edit a keyboard-only path: a focused widget enters **move-mode** (Enter /
  Space), then the arrow keys move it one grid cell and Shift + the arrow keys
  resize it, with Enter to drop and Escape to restore; Delete / Backspace removes
  the focused widget. Each step commits down the **same** path a pointer drag uses
  (a `gm:geometry-change` event folded into the layout by the `EditController`,
  forked copy-on-write and persisted) — no parallel mutation logic. Add and tab
  operations are exposed as announced controller methods for host toolbars.

  Every grid item becomes a focusable landmark (`role="group"`, an accessible name,
  `tabindex="0"`), and a `LiveAnnouncer` (a visually-hidden `role="status"` region)
  narrates each operation — entering move-mode, moving/resizing by cell, dropping,
  cancelling, adding, removing, and tab switching. Focus is rescued to a neighbour
  whenever a removal or tab switch would otherwise strand it on a detached node
  (the C-E3 lifecycle guarantee). Wire it in one call with
  `attachCanvasKeyboardA11y(canvas, editController, { labelFor })`.

  `PageCanvas` gains an additive `gm:rendered` event and an `itemElement()`
  accessor for the a11y layer to hook, and now names its `region` landmark. Ships a
  keyboard-only Playwright e2e (move + resize with no mouse) and wires
  `@axe-core/playwright` into the canvas e2e run, asserting no WCAG 2.1 AA
  violations in edit mode. The per-widget error boundary (#20) and virtualization
  (#21) remain sibling C-E3 issues.

- 699fb3c: feat(canvas): PageCanvas gridstack binding + custom-element mounting (FR-8, FR-11)

  Adds the `<gm-page-canvas>` custom element (`PageCanvas`) — the gridstack.js
  binding and the only DOM consumer in core. It renders a resolved
  `EffectiveLayout`, mounting one widget custom element per placed item with the
  widget ABI (`context`, `settings`, `instance-id`, `edit-mode` attributes plus the
  opaque `sdk` handle property) and the POC `{x,y,w,h,i}` geometry. A
  `WidgetMountManager` upholds the lifecycle guarantee that `disconnectedCallback`
  runs before an instance is removed or re-mounted (layout change, tab switch, gate
  flip). Exported from `@gridmason/core/canvas` (and the root barrel). Edit-mode
  authoring, keyboard/a11y, error boundaries, and virtualization are sibling C-E3
  issues that build on this foundation.

- 24d9091: feat(canvas): offscreen-widget virtualization, debounced layout writes, and canvas-interactive perf marks (FR-15)

  Adds the canvas performance layer (`@gridmason/core/canvas`, SPEC §7):

  - **Virtualization** — `CanvasVirtualizer` watches each placed grid item with an
    `IntersectionObserver` and drives `PageCanvas` to mount a widget only while its
    cell is near the viewport, tearing it down (through the same boundary/lifecycle
    path, so `disconnectedCallback` is honored) when it scrolls away. Opt in with
    the new `PageCanvas.virtualize` property (`virtualizeRootMargin` tunes the
    near-viewport band; `virtualizeObserverFactory` injects a custom scroll root or
    a test observer). Off by default — every widget mounts eagerly. A long page's
    interactive cost stays bounded by what fits on screen; grid items (and thus
    geometry/height) are always placed, so only the widget content is deferred.
  - **Debounced writes** — `DebouncedLayoutPersistence` decorates a host
    `LayoutPersistencePort`, coalescing a burst of rapid layout writes (a drag/resize
    gesture) into a single trailing `put(scopeKey, doc)` of the latest document,
    per scope key. `flush()`/`cancel()` force or drop pending writes at a boundary
    (blur, navigation, edit exit); an optional `maxWaitMs` caps a continuous burst.
    A host wraps its adapter and passes it to `EditController` unchanged.
  - **Perf marks** — `CanvasPerfMarker` times the data→interactive window (layout
    assigned → render settled) and emits it as a `canvas.interactive` telemetry
    event via the new `PageCanvas.perfTelemetry` sink — the attribution point for
    the **p95 < 300 ms** budget — while also recording `performance.mark`/`measure`
    User Timing entries for a devtools trace.

  Also adds a headless-variance-tolerant **CI perf smoke** (`perf/`): a fixed
  100-widget fixture, a Playwright harness that warms up then asserts the p95 of N
  steady-state canvas-interactive measurements against a CI-adjusted budget
  (`GM_PERF_BUDGET_MS`, default 300 ms), run via `npm run perf`; methodology
  documented in `perf/README.md`.

- 18ff3b3: fix(canvas): keyboard landmarks for widgets mounted lazily under virtualization

  With `PageCanvas.virtualize` on, a widget mounted lazily as it scrolled into view
  never became a keyboard landmark: the a11y layer only (re)applied landmarks on the
  full-render `gm:rendered` event, but a virtualizer mount happens _between_ renders,
  so a scrolled-in widget stayed unfocusable / not tab-reachable until an unrelated
  full render.

  `PageCanvas` now dispatches two additive, per-widget lifecycle events under
  virtualization — **`gm:widget-mounted`** (`CANVAS_WIDGET_MOUNTED_EVENT`) and
  **`gm:widget-unmounted`** (`CANVAS_WIDGET_UNMOUNTED_EVENT`), each with
  `detail.instanceId` (`CanvasWidgetLifecycleDetail`) — the scroll-driven complement
  to `gm:rendered`. The keyboard/a11y controller listens for them: it landmarks a
  lazily-mounted widget at once (so a scrolled-in widget is immediately keyboard-
  reachable) and, on unmount, rescues focus if the scrolled-out widget held it and
  then drops its landmark. A keyboard landmark now tracks mount state — an offscreen,
  torn-down widget is not a Tab stop and regains its landmark when scrolled back in.

  Also reconciles the `CanvasRenderedDetail.instanceIds` doc: it is every instance
  **placed** on the active grid (in placement order), not the mounted subset — under
  virtualization a placed item may be offscreen and unmounted yet still listed
  (read `mountedInstanceIds` for the mounted subset). Payload unchanged.

- e1d9405: feat(canvas): per-widget error boundary + skeletons + telemetry attribution (FR-10)

  Wraps every mounted widget in a per-widget error boundary (`src/canvas/boundary`).
  A widget that throws, fails to load, dispatches `gm:error`, or exceeds its latency
  budget is isolated behind a fallback card (name + retry) while its siblings and the
  rest of the canvas stay live — one widget's failure never takes the page down, and
  the canvas never blocks on widget code. A widget that signals `gm:loading` (or sets
  the `gm-loading` attribute) during connect shows an accessible loading skeleton
  until it dispatches `gm:ready`.

  Fallback cards name the widget only when the host's `widgetDescriptor` entitles it;
  an unknown/unresolved tag renders an anonymous "Unavailable widget" card with no
  tag/name echo (SPEC §6/§8 no-capability-leakage), and a gated-off instance — already
  omitted from the effective layout by the engine — never surfaces a card. Crashing
  `connectedCallback`s are caught however the environment surfaces them (propagated,
  or reported to the window `error` event as in real browsers).

  `PageCanvas` gains `telemetry`, `widgetDescriptor`, `latencyBudgetMs`,
  `autoDegradeOnLatency`, and `boundaryOf(i)`. The canvas-local `WidgetTelemetry`
  port emits per-widget `widget.error` / `widget.latency` events carrying the
  instance's source-qualified identity; it mirrors the engine's `CatalogTelemetry`
  shape and folds into the finalized C-E4 telemetry adapter when it lands.

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
