---
'@gridmason/core': minor
---

feat(canvas): keyboard alternative + a11y landmarks + live-region announcements (FR-9)

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
