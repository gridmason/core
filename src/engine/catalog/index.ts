/**
 * Widget type registry (docs/SPEC.md §2, §4): manifest-shaped entries, keyed by
 * source-qualified identity `(source, tag)`, with define-time collision refusal
 * and telemetry. See {@link WidgetCatalog}.
 */
export type {
  CatalogRefusalEvent,
  CatalogRefusalReason,
  CatalogRegistration,
  CatalogTelemetry,
  WidgetCatalogEntry,
  WidgetCatalogOptions,
} from './catalog.js';
export { WidgetCatalog } from './catalog.js';
