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

> Scope: this element is the **mounting + lifecycle foundation**. Edit-mode
> authoring (drag/resize/add/remove/tabs, #18), the keyboard alternative and
> richer a11y (#19), the per-widget error boundary and skeletons (#20), and
> virtualization + debounced writes (#21) build on it.

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
