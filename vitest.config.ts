import { defineConfig } from 'vitest/config';

// GW-D20 hard gate (SPEC §9): the engine layer — src/engine — is held at 100%
// line/branch/function/statement coverage from day one and stays enforced as
// those paths fill in. The engine is headless and DOM-free (SPEC §2); nothing
// outside src/engine carries a coverage threshold yet.
const engineGate = {
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
} as const;

export default defineConfig({
  test: {
    // Two test environments, split by layer (SPEC §2). The engine is headless
    // and must never touch the DOM, so its project runs under `node` with zero
    // DOM globals — a stray `window`/`document` reference in engine code fails
    // fast. The canvas is the only DOM consumer, so its project runs under
    // happy-dom. Vitest 4 replaced `environmentMatchGlobs` with `projects`.
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          environment: 'node',
          include: ['src/engine/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'canvas',
          environment: 'happy-dom',
          include: ['src/canvas/**/*.test.ts'],
        },
      },
      {
        // Adapters are host-implemented interfaces + the dev-only persistence
        // adapter (SPEC §2, §5). Its `Storage` backing is feature-detected and
        // fully exercised through an injected fake `Storage`, so the tests need
        // no DOM and run under `node` like the engine.
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: ['src/adapters/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        '**/src/engine/**': engineGate,
      },
    },
  },
});
