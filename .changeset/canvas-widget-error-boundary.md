---
'@gridmason/core': minor
---

feat(canvas): per-widget error boundary + skeletons + telemetry attribution (FR-10)

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
