/**
 * Widget type registry (docs/SPEC.md §2, §4): manifest-shaped entries, keyed by
 * source-qualified identity `(source, tag)`, with define-time collision refusal
 * and telemetry. See {@link WidgetCatalog}.
 */
export type {
  CatalogChangeEvent,
  CatalogClearedEvent,
  CatalogEventMap,
  CatalogRefusalEvent,
  CatalogRefusalReason,
  CatalogRegisteredEvent,
  CatalogRegistration,
  CatalogTelemetry,
  CatalogUnregisteredEvent,
  WidgetCatalogEntry,
  WidgetCatalogOptions,
} from './catalog.js';
export { WidgetCatalog } from './catalog.js';
