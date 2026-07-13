import { expect, test } from 'vitest';

import * as canvas from './index.js';

// Scaffold smoke test for the canvas project (see vitest.config.ts). The canvas
// is the only DOM consumer (SPEC §2), so its project runs under happy-dom; this
// asserts the DOM environment is wired and ready for the real <gm-page-canvas>
// tests that land with the C-E2 epic. It is the mirror of the engine smoke
// test's DOM-free assertion.
test('the canvas barrel is importable', () => {
  expect(canvas).toBeTypeOf('object');
  expect(canvas).not.toBeNull();
});

test('the canvas test environment has a DOM (happy-dom)', () => {
  expect(typeof window).not.toBe('undefined');
  expect(typeof document).not.toBe('undefined');
});
