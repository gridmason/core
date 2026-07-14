/**
 * Adapter interfaces (docs/SPEC.md §2, §5, FR-12) — the seam between the headless
 * engine and a host application. Core defines these as **interfaces only**; the
 * host implements them. Core makes zero network calls and ships no backend
 * (SPEC §1) — persistence, gates, permissions, telemetry, and settings-form UI
 * are all the host's to provide.
 *
 * The five adapters:
 * - **persistence** — {@link PersistenceAdapter}: `get`/`put`/`delete` a
 *   `LayoutDoc` by {@link ScopeKey} (`(scope-node | user, pageType, entityId?)`).
 *   Any KV backend fits.
 * - **gates** — {@link GatesAdapter}: is a widget's governance gate on (§6 check
 *   3)? The canonical superset of the engine's {@link WidgetGatePort}.
 * - **permissions** — {@link PermissionsAdapter}: does the user hold a widget's
 *   data permissions (§6 check 4)? The superset of {@link WidgetPermissionsPort}.
 * - **telemetry** — {@link TelemetryAdapter}: per-widget error + latency
 *   attribution (§7), reconciling the catalog's refusal sink
 *   ({@link CatalogTelemetry}) via {@link catalogTelemetryFor}.
 * - **settings-form** — {@link SettingsFormAdapter}: render the JSON-schema
 *   fallback settings form in the host's design system (§4).
 *
 * The bundled {@link DevPersistenceAdapter} is a **dev-only** default (in-memory
 * + localStorage) that warns loudly — never for production. Hosts validate their
 * own persistence adapter with {@link persistenceConformanceCases}.
 */
export type { PersistenceAdapter, ScopeKey, ScopeOwner } from './persistence.js';
export { scopeKeyString } from './persistence.js';

export type { GatesAdapter, WidgetGatePort } from './gates.js';
export type { PermissionsAdapter, WidgetPermissionsPort } from './permissions.js';
// `WidgetGatingQuery` is the shared query shape for gates and permissions; export once.
export type { WidgetGatingQuery } from './gates.js';

export type {
  TelemetryAdapter,
  TelemetryEvent,
  WidgetErrorEvent,
  WidgetLatencyEvent,
  CatalogRefusalEvent,
  CatalogTelemetry,
} from './telemetry.js';
export { catalogTelemetryFor } from './telemetry.js';

export type {
  SettingsFormAdapter,
  SettingsFormRequest,
  SettingsFormHandle,
  JsonSchema,
} from './settings-form.js';

export {
  DevPersistenceAdapter,
  DEV_PERSISTENCE_NAMESPACE,
  DEV_PERSISTENCE_WARNING,
} from './dev-persistence/dev-persistence.js';
export type { DevPersistenceOptions } from './dev-persistence/dev-persistence.js';

export { persistenceConformanceCases } from './persistence-conformance.js';
export type {
  PersistenceConformanceCase,
  PersistenceAdapterFactory,
} from './persistence-conformance.js';
