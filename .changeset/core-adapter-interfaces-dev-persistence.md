---
"@gridmason/core": minor
---

Add the host adapter surface (`@gridmason/core/adapters`, FR-12). Five interfaces the host implements — persistence (`get`/`put`/`delete` a `LayoutDoc` by `ScopeKey`), gates, permissions, telemetry (per-widget error + latency attribution), and settings-form (JSON-schema fallback form) — with the engine's minimal gate/permission ports and the catalog refusal telemetry reconciled into them. Ships a bundled **dev-only** `DevPersistenceAdapter` (in-memory + `localStorage`) that warns loudly at construction, plus a reusable, framework-agnostic `persistenceConformanceCases` suite a host can run against its own persistence adapter.
