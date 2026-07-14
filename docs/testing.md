# Testing the canvas: stories, e2e, and perf

`@gridmason/core` is two layers (SPEC §2). The **engine** (`src/engine`) is
headless and DOM-free, held at 100% unit coverage under `node` (the GW-D20 hard
gate). The **canvas** (`src/canvas`) is the only DOM consumer; it is proven three
ways, all documented here:

| Suite | Command | What it proves | CI gate |
|---|---|---|---|
| Unit | `npm test` / `npm run coverage` | Every engine + canvas + adapter module, fast, under `node`/happy-dom. Engine at 100%. | hard |
| Storybook | `npm run build-storybook` | Every visual canvas component carries a story (GW-D20 — no story, no merge). | hard |
| e2e | `npm run e2e` | The built canvas mounting + driving a **real** gridstack in Chromium. | hard |
| Perf smoke | `npm run perf` | A 100-widget page meets the canvas-interactive p95 budget (FR-15). | separate entrypoint |

`npm run typecheck` type-checks `src`, `stories`, `e2e`, and `perf` together, so a
story or spec that drifts from the live source fails the build.

## Stories (Storybook)

Framework-agnostic CSF under `stories/`. Each file builds a live
`<gm-page-canvas>` from an in-memory `EffectiveLayout` and demo widgets; the
shared demo widgets, layout builders, and canvas factory live in
`stories/support.ts` (not a `*.stories.ts` file, so it is not itself a story).

| Story (`title`) | File | Covers |
|---|---|---|
| `Canvas/PageCanvas` | `page-canvas.stories.ts` | Mount from a layout, edit-mode attribute, tabs |
| `Canvas/EditMode` | `edit-mode.stories.ts` | Add/remove/tab authoring + locked slot, persisted-doc view |
| `Canvas/KeyboardA11y` | `a11y.stories.ts` | Keyboard-only move/resize, landmarks, live-region announcements |
| `Canvas/WidgetBoundary` | `widget-boundary.stories.ts` | Fallback card, loading skeleton, anonymous unavailable-widget card |
| `Canvas/Virtualization` | `virtualization.stories.ts` | Offscreen widgets stay unmounted; live mounted-count |

**The full Storybook toolchain is intentionally not installed yet** — pre-1.0 the
rule is advisory (GW-D20) and the heavy `@storybook/*` build stack earns its keep
only when the dashboard hosts a Storybook. Until then `npm run storybook` /
`npm run build-storybook` run `.storybook/check-story-coverage.mjs`, the
**story-coverage gate**: it enumerates the component directories under
`src/canvas` and fails if a *visual* component has no story (or if a story points
at a component that no longer exists). Headless canvas helpers (`persistence`,
`perf`) are explicitly exempt in that file with a reason. Adding a new visual
canvas component without a story fails CI — that is the "no story, no merge"
enforcement. When the real Storybook config lands, its CSF stories render
unchanged and the coverage check moves into the Storybook build.

## e2e (Playwright)

Real-browser specs under `e2e/`, one per canvas concern. Each pairs a spec with a
static HTML **fixture** that boots the *built* ESM (`/dist/canvas/index.js`) plus
the real gridstack, wires a scenario, and hangs a control surface on `window`
(e.g. `window.__gm`) for the spec to drive via `page.evaluate`. `e2e/server.mjs`
serves the repo root over HTTP so each fixture's import map resolves `/dist/...`
and `/node_modules/...` exactly as a real host would; `playwright.config.ts`
builds `dist` and starts that server as its `webServer`.

| Spec | Fixture | Covers (issue) |
|---|---|---|
| `page-canvas.spec.ts` | `page-canvas.html` | Mount + lifecycle: ABI attrs, geometry round-trip, disconnect-before-remount, tab switch, edit-mode attr (#17) |
| `edit-mode.spec.ts` | `edit-mode.html` | Each edit op — add/remove/drag/resize/tabs — persisting through the adapter; copy-on-write fork; locked slot (#18) |
| `a11y.spec.ts` | `a11y.html` | axe (no WCAG 2.1 AA violations in edit mode), keyboard-only move/resize, announcements, focus safety, virtualized-mount landmark (#19) |
| `widget-boundary.spec.ts` | `widget-boundary.html` | Crash → fallback card + retry; slow → skeleton → ready; per-widget telemetry; anonymous unavailable card; gated-off leaks nothing (#20) |
| `import-degradation.spec.ts` | `import-degradation.html` | Layout import degrades an unavailable widget to the anonymous card with no tag/name/props leak, then restores losslessly (#23) |
| `poc-import.spec.ts` | `poc-import.html` | A real POC localStorage dump imports + renders; a host-unknown widget degrades without leaking its identity (#24) |
| `smoke.spec.ts` | — | The runner is wired (no browser). |

The three degradation entrypoints (`widget-boundary`, `import-degradation`,
`poc-import`) each assert the anonymous unavailable-widget card and its
no-identity-leak guarantee, but from **different paths** — a never-defined tag at
the boundary, an untrusted layout-import reference, and a POC dump with a
host-unknown widget — so they are distinct coverage, not duplication.

### Shared harness

- `e2e/support/harness.ts` — `gotoFixture(page, path, readyFlag)`: the navigate +
  wait-for-ready handshake every spec's `beforeEach` shares.
- `e2e/fixtures/support.js` — the `EffectiveLayout` envelope builders (`single`,
  `tabbed`) and the demo record context (`DEMO_CONTEXT`) the mounting, edit-mode,
  keyboard/a11y, and boundary fixtures share. Each fixture's widget classes and
  control surface stay in the fixture — they are the behavior under test. The
  import map + gridstack loader stay inline per fixture: an import map is
  document-scoped and must precede the module graph, so it cannot be shared.

## Perf smoke

`npm run perf` runs `perf/hundred-widgets.spec.ts` under its own
`perf/perf.config.ts` — kept separate from the functional e2e by design. It drives
many 100-widget builds, discards warm-up runs, and asserts the **p95** of the
canvas's own `canvas.interactive` mark against a CI-adjusted budget (default
300 ms, `GM_PERF_BUDGET_MS` to override). See `perf/README.md` for the
methodology.

## Running it all locally

```sh
npm ci
npm run typecheck && npm run lint && npm run coverage && npm run build
npm run build-storybook            # story-coverage gate
npx playwright install chromium    # once
npm run e2e                        # functional canvas e2e
npm run perf                       # perf smoke
```
