/**
 * `s7k-widgets-core` POC importer (docs/SPEC.md §5, FR-14; protocol FR-6). The
 * engine seam that brings a legacy POC localStorage dump forward into
 * current-version `LayoutDoc`s and projects one to its render-ready form.
 *
 * The widget-identity mapping and POC page shape are owned by
 * `@gridmason/protocol` (the converter contract, FR-6); this barrel re-surfaces
 * the input constant and types a host needs at the boundary alongside the core
 * wiring so consumers meet the importer at one import.
 */
export {
  importPocLayouts,
  POC_DEMO_PAGE_TYPE,
  toRenderablePocLayout,
} from './poc-importer.js';
export type {
  ImportedPocPage,
  ImportPocLayoutsResult,
  PocImportSourceError,
  PocImportSourceErrorCode,
  RenderablePocLayout,
} from './poc-importer.js';

// The localStorage key the POC persisted under + the POC input shapes, owned by
// protocol (FR-6) and re-surfaced so a host can read storage and type the payload
// without a second protocol import.
export { POC_LAYOUTS_STORAGE_KEY, POC_SCHEMA_VERSION } from '@gridmason/protocol';
export type {
  PocImportError,
  PocImportErrorCode,
  PocLayoutGrid,
  PocLayoutPage,
  PocLayoutTab,
  PocLayoutWidget,
} from '@gridmason/protocol';
