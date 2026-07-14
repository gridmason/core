---
"@gridmason/core": minor
---

**BREAKING** (event discriminator): rename `CatalogRefusalEvent.type` from `'catalog.register.refused'` (dots) to `'catalog:register:refused'` (colons), aligning it with every other engine event discriminator (`catalog:registered`, `pageType:registered`, `layout:loaded`). A host that switches or filters telemetry on the literal `'catalog.register.refused'` string — including via `@gridmason/core/adapters` `TelemetryEvent` — must update that comparison to `'catalog:register:refused'`. The event's shape, payload, and emission points are otherwise unchanged. Shipped in `@gridmason/core@0.1.0`; per the 0.x changesets convention this discriminator change is released as a `minor`.
