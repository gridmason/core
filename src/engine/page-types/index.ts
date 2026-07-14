/**
 * Page-type registry + typed context binding (docs/SPEC.md §3, FR-2/FR-3):
 * validated page-type descriptors keyed by id, each declaring the typed context
 * its canvas provides, its default layout, its locks, and whether users may
 * customize it. See {@link PageTypeRegistry}.
 */
export type {
  PageTypeChangeEvent,
  PageTypeEventMap,
  PageTypeInput,
  PageTypeRegisteredEvent,
  RegisteredPageType,
} from './page-types.js';
export { PageTypeRegistrationError, PageTypeRegistry } from './page-types.js';
