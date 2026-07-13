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

## Releasing

Versioning and publishing are driven by [changesets](https://github.com/changesets/changesets). The package ships ESM + type declarations under SemVer 0.x, publishing to npm as `@gridmason/core`.

**Add a changeset with every change that should ship.** After making a change, run:

```bash
npm run changeset
```

Pick the bump (patch/minor/major — we are pre-1.0, so breaking changes are `minor` and everything else is `patch`) and write a one-line summary. This drops a markdown file in `.changeset/`; commit it with your PR.

**How a changeset becomes a publish:**

1. PRs land on `main` carrying their `.changeset/*.md` files.
2. The [`release`](.github/workflows/release.yml) workflow runs on every push to `main`. When unreleased changesets are present it opens (or updates) a **"Version Packages"** PR that consumes the changesets, bumps `package.json`, and updates `CHANGELOG.md`.
3. Merging that PR pushes the version bump to `main`, which re-runs the workflow — this time with no pending changesets, so it runs `changeset publish` and pushes the release to npm.

Publishing authenticates with **npm Trusted Publishing (OIDC)** — there is no `NPM_TOKEN` secret. The workflow requests `id-token: write` and npm exchanges the GitHub OIDC token at publish time; [build provenance](https://docs.npmjs.com/generating-provenance-statements) is attached automatically (`NPM_CONFIG_PROVENANCE`).

> **Pre-M-A status:** `@gridmason/core` stays at `0.0.0` and is **not** published from CI yet. The first `0.0.x` publish happens at core milestone **M-A** (engine complete) and is maintainer-run. Until trusted publishing is enabled on npmjs.com (setup below), all `0.x` publishes are maintainer-run locally.

### Maintainer one-time setup (npmjs.com trusted publisher)

Trusted Publishing must be enabled once on npmjs.com before CI can publish. The `@gridmason` scope must already exist (`npm org create gridmason`) and the first `0.0.x` version must already be published (bootstrapped locally at M-A). Then, on npmjs.com:

**Package `@gridmason/core` → Settings → Trusted Publisher → GitHub Actions**, with:

| Field | Value |
|---|---|
| Organization / user | `gridmason` |
| Repository | `core` |
| Workflow filename | `release.yml` |
| Environment | *(leave blank)* |

After this is saved, the CI `release` workflow publishes without any token.

## License

AGPL-3.0-only. All contributions require the CLA (community files land separately).
