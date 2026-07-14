# Canvas widget ABI + lifecycle contract

The canvas (`@gridmason/core/canvas`) is the gridstack.js binding and the only
DOM consumer in core (docs/SPEC.md §2). It renders a resolved `EffectiveLayout`
from the headless engine by mounting one **widget custom element** per placed
item. This document is the contract a widget author targets (SPEC §4, FR-8,
FR-11); it is the prose companion to the TSDoc on `PageCanvas`, `WidgetMountManager`,
and `abi.ts`.

Core **loads nothing** — it mounts custom-element tags the host has already
registered (SPEC §8). `<gm-page-canvas>` never defines, fetches, or verifies a
widget; it only mounts an already-defined tag.

## `<gm-page-canvas>` (the `PageCanvas` element)

Register it once (idempotent): `PageCanvas.define()`. Inputs are set as
**properties**, because they are structured values a string attribute cannot
carry; each assignment re-renders synchronously:

| Property | Type | Meaning |
|---|---|---|
| `layout` | `EffectiveLayout` | The resolved layout to render (from `resolveLayout` / `resolveAndGateLayout`). |
| `context` | `unknown` | The typed page-context **value** the page provides; serialized to every widget's `context` attribute. |
| `sdk` | `unknown` | The **opaque** host SDK handle, passed through to each widget. Core never inspects it. |
| `editMode` | `boolean` | Reflects the `edit-mode` attribute on widgets and takes gridstack out of static mode. |
| `activeTab` | `number` | For a tabbed layout, which tab's grid renders. |

Read-back helpers: `mountedInstanceIds`, `widgetElement(i)`, and `geometryOf(i)`
(the live `{x,y,w,h,i}` — the POC geometry, unchanged).

Boundary configuration (all optional; set any time — applies to the next
mount/retry):

| Property | Type | Meaning |
|---|---|---|
| `telemetry` | `WidgetTelemetry` | Sink for per-widget error + latency attribution events (§ *Error boundary* below). |
| `widgetDescriptor` | `WidgetDescriptor` | Resolves a display **name** for a fallback card; return `undefined` to keep it anonymous (no capability leakage). |
| `latencyBudgetMs` | `number` | Ms a pending (skeleton) widget may take before a `widget.latency` `exceeded` event fires. |
| `autoDegradeOnLatency` | `boolean` | When `true`, a widget that blows its budget is auto-degraded to its fallback card. |

Boundary introspection: `boundaryOf(i)` returns the per-widget boundary (its
`state` is `loading` / `ready` / `error`).

In edit mode the element dispatches a **`gm:geometry-change`** `CustomEvent`
(`CANVAS_GEOMETRY_CHANGE_EVENT`) after a **user** drag or resize settles, with
`detail.geometry` carrying every item's post-edit `{x,y,w,h,i}`. Only pointer
edits fire it — the canvas's own programmatic re-render (a `layout` assignment)
does not — so a consumer can round-trip the edit back into `layout` without a
feedback loop. This is the hook the edit-mode controller listens on.

### Canvas lifecycle events

Three additive, bubbling/composed `CustomEvent`s report what the grid is doing,
so the a11y layer (#19) can keep keyboard landmarks and focus in sync as widgets
mount and unmount. Distinct from `gm:geometry-change`, which fires only for a
**user** pointer edit:

| Event | Constant | `detail` | When |
|---|---|---|---|
| `gm:rendered` | `CANVAS_RENDERED_EVENT` | `{ instanceIds }` | After **every** programmatic render reconciles the grid (a `layout`/`activeTab` change, a resolution-gate flip). |
| `gm:widget-mounted` | `CANVAS_WIDGET_MOUNTED_EVENT` | `{ instanceId }` | Under **virtualization** only, when one widget mounts because its cell scrolled into the near-viewport band. |
| `gm:widget-unmounted` | `CANVAS_WIDGET_UNMOUNTED_EVENT` | `{ instanceId }` | Under **virtualization** only, when one widget unmounts because its cell scrolled out of the band. |

`gm:rendered`'s `detail.instanceIds` lists every instance **placed** on the active
grid, in placement order — *not* the mounted subset. Under `virtualize` a placed
item can be offscreen with its widget unmounted yet still appear here (its grid
item exists, so geometry and page height stay correct); read `mountedInstanceIds`
for the actually-mounted subset. `gm:widget-mounted` / `gm:widget-unmounted` are
its per-widget, scroll-driven complement: virtualization changes what is mounted
*between* renders, so these fire once per widget as it enters or leaves the band.
The a11y layer landmarks a lazily-mounted widget on `gm:widget-mounted` (so a
scrolled-in widget is keyboard-reachable at once, not only after some later full
render) and, on `gm:widget-unmounted`, rescues focus if the scrolled-out widget
held it and then drops its landmark. A keyboard **landmark tracks mount state**:
an offscreen, torn-down widget is not a Tab stop, and regains its landmark when it
scrolls back into view.

## Edit mode (`edit-mode`, #18)

`EditController` (`@gridmason/core/canvas`) drives an authoring session over a
`PageCanvas`: `enter()`/`exit()` toggle edit mode; drag/resize arrive via the
geometry-change event; `addWidget` first-fits a new instance (its eligible list
comes from the C-E2 picker gating); `removeWidget` tears one down; `addTab`/
`renameTab`/`switchTab` author tabs when the page type allows them. Every edit
forks a personal copy on first genuine change (copy-on-write, SPEC §5) and is
written back through a `LayoutPersistencePort` (`put(scopeKey, doc)`); a **locked
slot** is never offered a move/resize/remove. The controller drives the canvas
only through `layout`/`editMode`/`activeTab` and the geometry-change event — it
never touches gridstack — so the engine's DOM-free split holds.

> Scope: this element is the **mounting + lifecycle foundation**. Every widget is
> mounted through a per-widget error boundary + skeleton (#20, below); edit-mode
> authoring (drag/resize/add/remove/tabs, #18) builds on it. The keyboard
> alternative and richer a11y (#19) and virtualization + debounced writes (#21)
> build on it too.

## Widget ABI — what a widget receives

The canvas sets four **attributes** and one **property** on each mounted widget,
all configured **before** the element is inserted into the DOM, so the widget's
`connectedCallback` observes a fully-configured element:

- `context` — serialized typed page-context value (JSON). Same for every widget
  on the page.
- `settings` — the instance's saved props (JSON; `{}` when none).
- `instance-id` — the layout's stable grid-item key `i`.
- `edit-mode` — a **boolean attribute**: present iff the canvas is in edit mode
  (no value is significant — presence is the signal).
- `sdk` (property, not attribute) — the opaque host SDK handle. Read
  `this.sdk` in the widget; core assigns it and never reads it back.

`context`, `settings`, and `edit-mode` may be updated **in place** (no re-mount)
when they change, so a context change or an edit-mode toggle never tears the
widget down or loses its state. List them in `observedAttributes` to react.

Widgets emit outward as DOM `CustomEvent`s (e.g. `gm:action`); cross-widget
communication goes through the SDK handle's typed event bus, not the canvas.

## Lifecycle guarantee (FR-11)

> **`disconnectedCallback` is guaranteed to run before an instance is removed or
> re-mounted** — on any layout change, tab switch, or resolution-gate flip.

Every element mount/unmount flows through `WidgetMountManager`, which removes an
element from the DOM (firing its `disconnectedCallback`) **before** its slot is
reused. On a re-render the canvas unmounts departing and identity-changed widgets
*first*, then mounts arrivals — so every `disconnectedCallback` is delivered
before any new `connectedCallback`.

### Widget cleanup contract

A widget **must** release everything it allocated **outside** the SDK in its
`disconnectedCallback`:

- timers (`setInterval` / `setTimeout`);
- observers (`IntersectionObserver` / `ResizeObserver` / `MutationObserver`);
- listeners it added to a target it does not own (`window`, `document`, media
  queries).

Event-bus subscriptions made through the SDK handle are **auto-released on
unmount** (sdk §3 rule 6), so a well-behaved widget's only cleanup burden is what
it allocated outside the SDK. The canvas guarantees the callback *fires*; honoring
it is the widget's responsibility. A widget that leaks a timer or observer keeps
running after it leaves the page — the canvas cannot reclaim those for it.

## Error boundary, skeletons, and telemetry (FR-10, SPEC §7)

Every widget is mounted inside a **per-widget error boundary**: a widget that
throws, fails to load, reports an error, or runs slow is isolated so its siblings
and the rest of the canvas are unaffected — **one widget's failure never takes
the page down**, and **the canvas never blocks on widget code**.

### Readiness contract (skeletons)

A widget tells the boundary how it loads, so a trivial widget is never stranded
behind a spinner and a slow one always shows a skeleton:

- A widget that finishes initializing **synchronously** dispatches nothing — it
  is interactive when its `connectedCallback` returns (no skeleton).
- A widget that loads **asynchronously** signals *pending* during
  `connectedCallback`, either by dispatching a bubbling **`gm:loading`**
  `CustomEvent` or by setting the boolean attribute **`gm-loading`**. The boundary
  shows a skeleton until the widget dispatches **`gm:ready`**, then reveals it.
- A widget may dispatch **`gm:error`** (`detail?: { message?, error? }`) at any
  time to fall back to its error card.

A widget whose tag was **never registered** is an entitled *load failure* and
gets the fallback card; a *gated-off* instance is omitted by the engine and never
reaches a boundary (SPEC §6 — no card, no capability leakage).

### Fallback card

The card shows the widget's **name** (from `widgetDescriptor`) and a **retry**
that re-runs the whole mount lifecycle cleanly (`disconnectedCallback` before the
fresh mount). When no name is available (an unknown/unentitled tag), the card is
**anonymous** ("Unavailable widget") and echoes **no tag or name** (SPEC §6/§8).
Cards and skeletons are accessible: a skeleton exposes a `role="status"`
announcement; a card is a labelled `role="group"` with a `role="alert"` message
and a real focusable retry `<button>`.

### Telemetry attribution

Per-widget **error** and **latency** events flow to the host `telemetry` sink
(never over the network — core makes zero network calls). Every event carries the
instance identity (`instanceId` + source-qualified `widgetID`) so a host can
attribute *which widget, from which source* failed or ran slow, and may
auto-degrade a widget that exceeds its `latencyBudgetMs`. Telemetry is host-
internal, so — unlike the user-facing card — it always carries the full identity.

> The canvas-local `WidgetTelemetry` port mirrors the engine's `CatalogTelemetry`
> shape; both fold into the finalized C-E4 telemetry adapter when it lands.
