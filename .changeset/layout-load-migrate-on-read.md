---
'@gridmason/core': minor
---

Add `loadLayout`, the engine-layer LayoutDoc load/normalize operation (FR-4). It
runs the `@gridmason/protocol` migrate-on-read chain and reshapes the result for
the host: an older-version document is upgraded in memory and flagged
`migrated` so persistence writes the current version back, while a document
newer than this build understands is returned untouched as `readOnly` with a
`warning` for the canvas banner — never migrated, never rewritten.
