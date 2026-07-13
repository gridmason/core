# Contributing to `@gridmason/core`

Thanks for your interest in contributing. This package is the **engine** of
Gridmason: the framework-agnostic widgetized page-view core. It ships the
headless layout engine (widget catalog, `LayoutDoc` resolution, 3-level layout
governance, add-widget picker gating) and the `gridstack` canvas binding that
every host embeds. It is **zero host-specific code** — the embedding application
supplies the adapters (persistence, gates, permissions, telemetry). Because a
change here affects every host that mounts the engine, the contribution process
is deliberately strict about the **engine's correctness** and its **public API**.

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md) and
[Security Policy](./SECURITY.md). Never file a suspected vulnerability as a
public issue or PR — follow [SECURITY.md](./SECURITY.md) instead.

## Contributor License Agreement (required)

Gridmason is released under [AGPL-3.0](./LICENSE), and Sniper7Kills LLC offers it
under separate commercial terms as well. To keep dual licensing possible, **every
contributor must sign the [Contributor License Agreement](./.github/CLA.md)**
before their pull request can be merged.

You do not need to do anything up front. When you open your first pull request, a
bot comments with the CLA text and a one-line instruction; you sign by replying
with the exact sentence it gives you. The signature is recorded once and applies
to all your future contributions. PRs from unsigned contributors are blocked from
merging until the CLA is signed.

## Development setup

Requirements: **Node.js >= 22** (the package targets modern ESM; see `engines`
in `package.json`) and npm.

```bash
git clone https://github.com/gridmason/core.git
cd core
npm ci          # install exact, locked dependencies
```

The package has two runtime dependencies and nothing else: `gridstack` (the
canvas binding) and `@gridmason/protocol` (the context, manifest, and
`LayoutDoc` types the engine builds against). `@gridmason/protocol` is consumed
as an ordinary versioned package — core is a downstream consumer of the
protocol, not a co-maintained monorepo sibling.

Local checks — these are exactly what CI runs, and all of them must be green
before you open a PR:

```bash
npm run build           # tsc -> dist/ (ESM + type declarations)
npm test                # vitest run (engine + canvas projects)
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm run coverage        # enforces the 100% engine-coverage gate on src/engine
npm run build-storybook # advisory pre-1.0 Storybook harness (stub for now)
npm run e2e             # advisory pre-1.0 Playwright canvas harness (stub for now)
```

Useful during development:

```bash
npm run test:watch   # vitest in watch mode
npm run lint:fix     # auto-fix lint issues
```

### The two-project test split

The suite runs in **two vitest projects**, split by layer (SPEC §2), configured
in `vitest.config.ts`:

- **engine** — `src/engine/**`, `node` environment with **zero DOM globals**.
  The engine is headless and must never touch the DOM, so a stray
  `window`/`document` reference in engine code fails fast.
- **canvas** — `src/canvas/**`, `happy-dom` environment. The `gridstack`
  binding is the only DOM consumer, so it is the only layer with a DOM under it.

Unit tests live co-located with the code they cover (`src/**/*.test.ts`). Put a
test next to the layer it exercises so it lands in the right project.

### The engine-coverage gate is not negotiable

`src/engine` is the headless core every host runs, so it carries a **100%
line/branch/function/statement coverage gate** (GW-D20, SPEC §9), enforced by
`npm run coverage` in CI. The gate fail-closes: an untested engine file with
executable code drops coverage below threshold and the job exits non-zero. Any
change touching `src/engine` must land with tests — including **negative** cases
(a layout referencing an unknown widget tag, a governance lock that must be
honored, a picker gate that must refuse). There is no path to merge that lowers
coverage on `src/engine`. Nothing outside `src/engine` carries a coverage
threshold yet.

### Advisory pre-1.0 harnesses

Storybook (`.storybook/`) and Playwright (`playwright.config.ts` + `e2e/`) are
**stubs** in the current scaffold — a Storybook build script that exits 0 and a
Playwright smoke spec that runs without launching a browser. The real stories
and browser-driven canvas e2e land with the C-E2/C-E4 canvas epics, which extend
these harnesses rather than bootstrap them. Pre-1.0 the "story per component, no
story no merge" rule is **advisory** (GW-D20): keep the stub scripts green, and
add a story when you add a canvas component.

## Keeping the engine headless and minimal

The engine's guarantees constrain *how* changes are allowed to happen:

- **The engine loads nothing and makes no network calls (SPEC §8).** Core mounts
  custom-element tags the host has already registered; verification and loading
  are the host shell's and the registry's job. Do not add `<script>` injection,
  URL/base64 widget import, `new RegExp(userInput)`, or any network or
  filesystem access to the engine. A layout that references an unknown tag must
  degrade to an anonymous "unavailable widget" card — **no tag or name echo**
  (the no-capability-leakage rule, SPEC §6/§8).
- **The engine stays DOM-free.** Host-specific concerns (persistence, gates,
  permissions, telemetry) are reached only through the **adapter interfaces** in
  `src/adapters`, which core declares and the host implements. Do not reach into
  a real DOM, a real backend, or a host framework from `src/engine`.
- **New dependencies are a big deal.** Core depends only on `gridstack` and
  `@gridmason/protocol`, and takes on no dependency on the registry, the SDK
  implementation, or any host (SPEC §9). A new runtime dependency must be
  minimal, pinned, and justified in the PR.
- **Contract changes to the protocol are contract-first, not atomic.** If your
  change needs a new field or type from `@gridmason/protocol`, land it in that
  repo first, cut a release, then bump the pinned version here. We do not do
  coordinated cross-repo merges.

## Changesets (required on user-facing changes)

This package publishes `@gridmason/core` to npm via
[changesets](https://github.com/changesets/changesets) with SemVer. **Any change
that affects consumers — an exported type or function, an adapter interface,
runtime behavior, or the public API — must include a changeset** so the release
notes and version bump are generated correctly:

```bash
npx changeset
```

Pick the bump that matches the impact:

- **patch** — bug fix with no API change.
- **minor** — additive, backward-compatible change (a new optional export, a new
  adapter method with a default).
- **major** — a breaking change (a changed export signature or adapter contract).
  Pre-1.0, breaking changes bump the `0.x` minor per SemVer's 0.x rules; call
  them out clearly in the changeset regardless.

Changesets are **not** required for changes with no consumer impact (internal
refactors with identical behavior, tests, CI, or documentation). If in doubt,
add one — an extra patch note is cheaper than a missed release.

## Pull request checklist

Before you open a PR:

- [ ] `npm run build && npm test && npm run lint && npm run typecheck` all pass.
- [ ] `npm run coverage` passes if you touched `src/engine` (100% is the gate).
- [ ] Tests added/updated, including negative cases for governance/picker logic.
- [ ] A Storybook story added/updated if you added or changed a canvas component
      (advisory pre-1.0).
- [ ] A changeset is included if the change is user-facing.
- [ ] The CLA is signed (the bot will guide you on your first PR).
- [ ] The PR description explains the impact — is this additive (minor) or
      breaking (major), and which exports or adapter interfaces are affected?

Small, focused PRs review faster. For a significant change, opening an issue to
discuss the approach first is welcome — especially for anything that touches the
adapter interfaces, the governance model, or the engine/canvas boundary.

## License

By contributing, you agree that your contributions are licensed under the
project's [AGPL-3.0](./LICENSE) license and are covered by the terms of the
[CLA](./.github/CLA.md) you signed.
