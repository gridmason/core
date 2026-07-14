---
'@gridmason/core': minor
---

feat(canvas): PageCanvas gridstack binding + custom-element mounting (FR-8, FR-11)

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
