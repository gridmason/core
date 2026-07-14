import { expect, test } from 'vitest';

import * as core from '../index.js';
import * as engine from './index.js';

// Scaffold smoke test: proves the barrels are importable and that vitest +
// the engine-coverage gate run in CI. As the C-E1 engine lands, these barrels
// begin to expose runtime members (catalog, resolveLayout, picker gating).
test('the package barrels are importable', () => {
  expect(core).toBeTypeOf('object');
  expect(engine).toBeTypeOf('object');
  expect(core).not.toBeNull();
});

// The consolidated headless surface (issue #12): the engine barrel re-exports
// the catalog, page-type registry, layout ops + store, and the event model as
// one public API — the surface a host or the canvas layer consumes.
test('the engine barrel exposes the consolidated public surface', () => {
  expect(engine.WidgetCatalog).toBeTypeOf('function');
  expect(engine.PageTypeRegistry).toBeTypeOf('function');
  expect(engine.LayoutStore).toBeTypeOf('function');
  expect(engine.loadLayout).toBeTypeOf('function');
  expect(engine.Emitter).toBeTypeOf('function');
});

// GW-D20 / SPEC §2: the engine layer is headless and never touches the DOM, so
// its test environment must expose zero DOM globals. If this file ever ran under
// happy-dom/jsdom, `window` would be defined and DOM leakage into the engine
// could go unnoticed — this asserts the fail-fast node environment is in effect.
// `customElements` is the sharpest tripwire: the catalog is the runtime analogue
// of `customElements.define`, so its absence proves the engine models the tag
// namespace itself rather than reaching for the DOM registry.
test('the engine test environment is DOM-free', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
  expect(typeof customElements).toBe('undefined');
});
