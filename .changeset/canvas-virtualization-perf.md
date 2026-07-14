---
'@gridmason/core': minor
---

feat(canvas): offscreen-widget virtualization, debounced layout writes, and canvas-interactive perf marks (FR-15)

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
