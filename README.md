# core

`@gridmason/core` — framework-agnostic widgetized page-view engine (gridstack canvas, typed page contexts, 3-level layout governance). Public OSS (AGPL-3.0). Engineering spec: `docs/SPEC.md` · Build plan: `docs/specs/core-v0/spec.md`.

## Install

```bash
npm install @gridmason/core
```

The package is published to npm as `@gridmason/core`, ships ESM + type declarations, and requires **Node ≥ 22**. Its only runtime dependencies are `gridstack` and `@gridmason/protocol`. Import the whole surface from the root, or a single layer from its subpath: `@gridmason/core/engine` (headless), `@gridmason/core/canvas` (the gridstack binding), and `@gridmason/core/adapters` (the host-implemented interfaces).

## Quickstart

A minimal end-to-end embed: register a widget type, declare a page type, resolve a layout, and mount it. Core **loads nothing** — it mounts custom-element tags you have already registered with `customElements.define`, so the host owns the `acme-clock` element referenced below.

```ts
import {
  WidgetCatalog,
  PageTypeRegistry,
  resolveLayout,
  CURRENT_LAYOUT_SCHEMA_VERSION,
} from '@gridmason/core/engine';
import { PageCanvas } from '@gridmason/core/canvas';

// 1. Register the widget *types* the host has loaded, keyed by source-qualified
//    identity (source, tag). `register` never throws — a bad/colliding manifest
//    comes back as { ok: false, event }.
const catalog = new WidgetCatalog();
const registration = catalog.register('local', {
  formatVersion: '1.0',
  tag: 'acme-clock',
  kind: 'widget',
  name: 'Clock',
  publisher: 'acme',
  version: '1.0.0',
  entry: './clock.js',
});
if (!registration.ok) throw new Error('widget refused');

// 2. Declare a page type — the typed context the page provides to its widgets,
//    and whether users may customize it.
const pageTypes = new PageTypeRegistry();
pageTypes.register({
  id: 'demo.home',
  context: {},
  allow_user_customization: true,
});

// 3. Resolve a LayoutDoc through the 3-level governance model into an
//    EffectiveLayout. Here only the default level is supplied.
const effective = resolveLayout({
  default: {
    layout: {
      schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
      page: 'demo.home',
      name: 'Home',
      default: true,
      hasTabs: false,
      grid: {
        items: [
          {
            widgetID: { source: 'local', tag: 'acme-clock' },
            i: 'clock-1',
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      },
      tabs: [],
    },
  },
});

// 4. Mount. Define the element once (idempotent), then set inputs as properties:
//    the resolved layout, the typed page-context value, and the opaque host SDK
//    handle (core stores it verbatim and never inspects it).
PageCanvas.define();
const canvas = new PageCanvas();
canvas.layout = effective;
canvas.context = {};
canvas.sdk = hostSdkHandle; // your @gridmason/sdk host handle, or undefined
document.body.append(canvas);
```

The catalog and page-type registry are what the engine consults for picker eligibility and resolution-time gating; `resolveLayout` composes the default/org/user levels into the `EffectiveLayout` the canvas renders. See the two API references below for the full surface.

## Documentation

| Document | Covers |
| --- | --- |
| [`docs/SPEC.md`](docs/SPEC.md) | The engineering spec: the two-layer (engine + canvas) architecture, the governance model, and the security posture. |
| [`docs/engine-api.md`](docs/engine-api.md) | The headless `@gridmason/core/engine` surface — the widget catalog, page-type registry, layout operations, and the change-event model. |
| [`docs/canvas-abi.md`](docs/canvas-abi.md) | The `@gridmason/core/canvas` widget ABI and lifecycle contract — what `<gm-page-canvas>` sets on each widget, the SDK-handle delivery guarantee, and the error boundary. |
| [`docs/testing.md`](docs/testing.md) | How the two layers are tested: unit coverage, the story-coverage gate, canvas e2e, and the perf smoke. |

The build plan lives under [`docs/specs/core-v0/`](docs/specs/core-v0/).

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
| `npm run build-storybook` | Story-coverage check (GW-D20 — every visual canvas component carries a story). |

Unit tests live co-located with the code (`src/**/*.test.ts`) and run in two vitest projects (`vitest.config.ts`):

- **engine** — `src/engine/**`, `node` environment with **zero DOM globals**. The engine never touches the DOM (SPEC §2), so a stray `window`/`document` reference fails fast.
- **canvas** — `src/canvas/**`, `happy-dom` environment (the canvas is the only DOM consumer).

### Engine-coverage gate (GW-D20)

`npm run coverage` enforces **100%** line/branch/function/statement coverage over `src/engine`, and CI fails the batch if it drops below. The gate fail-closes: an untested engine file with executable code drops coverage below threshold and exits non-zero. Nothing outside `src/engine` carries a coverage threshold yet.

### Stories and pre-1.0 harnesses

The canvas components carry framework-agnostic CSF stories under `stories/`, enforced by the `build-storybook` script — a story-coverage checker in `.storybook/` that fails the build when a visual component ships without one ("story per component, no story no merge", GW-D20). It is **not** a browsable Storybook dev server: there is no story runner wired yet, so the script validates coverage rather than launching a UI. Playwright (`playwright.config.ts` + `e2e/`) drives the built canvas against a real gridstack in Chromium; `perf/` runs the canvas-interactive p95 smoke. See [`docs/testing.md`](docs/testing.md) for the full picture.

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

`@gridmason/core` is published to npm and releases through this CI flow — the version on the registry is the latest `0.x` merged to `main`. Breaking changes ship as `minor` bumps while the package is pre-1.0.

### Maintainer one-time setup (npmjs.com trusted publisher)

Trusted Publishing is configured once on npmjs.com so CI can publish without a token; it is already in place for this package, and the settings below are kept for reference (e.g. re-registering the publisher). On npmjs.com:

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
