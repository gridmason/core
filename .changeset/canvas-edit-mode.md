---
'@gridmason/core': minor
---

feat(canvas): edit mode — drag/resize/add/remove/tabs with copy-on-write persistence (FR-9)

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
+ debounced writes (#21) are sibling C-E3 issues that build on this.
