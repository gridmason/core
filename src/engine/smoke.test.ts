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

// GW-D20 / SPEC §2: the engine layer is headless and never touches the DOM, so
// its test environment must expose zero DOM globals. If this file ever ran under
// happy-dom/jsdom, `window` would be defined and DOM leakage into the engine
// could go unnoticed — this asserts the fail-fast node environment is in effect.
test('the engine test environment is DOM-free', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
});
