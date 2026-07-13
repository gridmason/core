# core

`@gridmason/core` — framework-agnostic widgetized page-view engine (gridstack canvas, typed page contexts, 3-level layout governance). Public OSS (AGPL-3.0). Engineering spec: `docs/SPEC.md` · Build plan: `docs/specs/core-v0/spec.md`.

## Layout (SPEC §2)

```
src/
├── engine/     headless, DOM-free, 100%-unit-tested: catalog · layout · placement · picker
├── canvas/     gridstack.js binding — the only DOM consumer
└── adapters/   interfaces only; the host implements them
```

The package ships ESM + type declarations and depends only on `gridstack` and `@gridmason/protocol`.

## Development

Requires Node ≥ 22.

| Script | Does |
| --- | --- |
| `npm run build` | Emit ESM + `.d.ts` to `dist/` (`tsc -p tsconfig.build.json`). |
| `npm run typecheck` | Type-check everything with no emit. |
| `npm test` | Run the vitest unit suites. |
| `npm run coverage` | Run the suites with the engine-coverage gate. |
| `npm run lint` | ESLint (flat config). |
| `npm run e2e` | Playwright canvas e2e (smoke harness for now). |
| `npm run build-storybook` | Storybook build (stub for now). |

Unit tests live co-located with the code (`src/**/*.test.ts`) and run in two vitest projects (`vitest.config.ts`):

- **engine** — `src/engine/**`, `node` environment with **zero DOM globals**. The engine never touches the DOM (SPEC §2), so a stray `window`/`document` reference fails fast.
- **canvas** — `src/canvas/**`, `happy-dom` environment (the canvas is the only DOM consumer).

### Engine-coverage gate (GW-D20)

`npm run coverage` enforces **100%** line/branch/function/statement coverage over `src/engine`, and CI fails the batch if it drops below. The gate fail-closes: an untested engine file with executable code drops coverage below threshold and exits non-zero. Nothing outside `src/engine` carries a coverage threshold yet.

### Advisory pre-1.0 harnesses

Storybook (`.storybook/`) and Playwright (`playwright.config.ts` + `e2e/`) are **stubs** in this scaffold — a Storybook build script that exits 0 and a Playwright smoke spec that runs without launching a browser. The full stories and browser-driven canvas e2e land with the C-E2/C-E4 epics, which extend these harnesses rather than bootstrap them. Pre-1.0 the "story per component, no story no merge" rule is advisory (GW-D20).

## License

AGPL-3.0-only. All contributions require the CLA (community files land separately).
