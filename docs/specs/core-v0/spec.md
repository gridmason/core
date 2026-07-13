---
name: Gridmason Core v0
slug: core-v0
status: approved
created: 2026-07-13
approved: 2026-07-13
---

# Gridmason Core v0

## Overview

`@gridmason/core` is the framework-agnostic widgetized page-view engine: widget catalog, typed page contexts, layout resolution with 3-level governance, gridstack canvas, edit mode, and adapter interfaces. Everything above the grid, below the host application. Zero host-specific code, zero network calls — the host supplies adapters.

Full engineering spec: [`docs/SPEC.md`](../../SPEC.md). All of core is **Phase A** — core *is* the side-project product. Exit: the Gridmason Dashboard boots on it.

## Goals

- A host embeds the engine and renders governed, editable widget pages with only adapter code.
- Headless engine layer 100% unit-testable with no DOM (the GW-D20 hard gate: full unit suite on `src/engine`).
- p95 canvas interactive < 300 ms after data; WCAG 2.1 AA including edit mode.

## Non-goals

- Module loading/verification (registry + host shell), network I/O, persistence backends, authn/authz, visual design beyond structural CSS (hosts theme via CSS custom properties).
- No Module-Federation runtime (GW-D22: widgets are plain ES modules registering custom elements).

## Users & personas

- **Host-app developers** (dashboard, product shells) — embed `PageCanvas`, implement adapters.
- **Widget authors** — target the widget ABI (attrs in, CustomEvents out, SDK handle opaque).
- **End users** — drag/resize/add/remove widgets within governance locks.

## Functional requirements

- **FR-1** Widget type catalog: manifest-shaped registration, source-qualified identity `(source, tag)`, define-time tag-collision refusal with telemetry (SPEC §4).
- **FR-2** Page-type model: descriptor registration (context declaration, `default_layout`, `locks`, `allow_user_customization`); every route renders a page canvas — a "fixed" page is a locked layout (SPEC §3).
- **FR-3** Typed page contexts via `@gridmason/protocol`; regex escape hatch retained for migration.
- **FR-4** LayoutDoc operations on the protocol schema: migrate-on-read, write-back current, unknown-newer renders read-only with warning (SPEC §5).
- **FR-5** 3-level resolution `resolveLayout(inputs) → EffectiveLayout` as a pure function: plugin/host default → org layout → user layout; most-specific wins; locked slots merge down; copy-on-write fork on first user edit; reset-to-default at every level (SPEC §5).
- **FR-6** Picker gating: all four checks (context subset, `supportsPages` glob via safe matcher, gate on, permission held); failing 3–4 = absent, not greyed (SPEC §6).
- **FR-7** The same four checks at layout resolution: gated-off persisted instances silently omitted, saved layout untouched, re-enable restores (SPEC §6).
- **FR-8** Canvas: gridstack.js binding, mounts custom elements with ABI attrs (`context`, `settings`, `instance-id`, `edit-mode`); geometry `{x,y,w,h,i}` (SPEC §2, §4).
- **FR-9** Edit mode: drag/resize/add/remove/tabs + full keyboard alternative (move-mode + arrows) + a11y announcements; WCAG 2.1 AA (SPEC §2, §7).
- **FR-10** Per-widget error boundary → fallback card (name + retry); skeletons for slow widgets; canvas never blocks on widget code (SPEC §7).
- **FR-11** Lifecycle: `disconnectedCallback` guaranteed before removal/re-mount; documented cleanup contract (SPEC §4).
- **FR-12** Adapter interfaces: persistence (`get/put(scopeKey)`), gates, permissions, telemetry, settings-form; bundled dev-only in-memory+localStorage persistence adapter, clearly labeled (SPEC §2, §5).
- **FR-13** Layout export/import: schema-validated; unknown tags degrade to anonymous "unavailable widget" cards — no tag/name echo (SPEC §8).
- **FR-14** POC importer path wired (protocol FR-6) for `s7k-widgets-core` layouts.
- **FR-15** Perf: offscreen-widget virtualization, debounced layout writes, p95 < 300 ms budget with telemetry marks (SPEC §7).
- **FR-16** Security posture: no script-injection APIs, no `new RegExp(userInput)`, zero network calls (SPEC §8).
- **FR-17** Publishes `@gridmason/core` 0.x (ESM + types, changesets); Storybook stories for canvas components (advisory pre-1.0, GW-D20); Playwright e2e for the canvas.

## Architecture & stack

TS ESM library. `src/engine` (headless, DOM-free), `src/canvas` (gridstack binding + `<gm-page-canvas>`), `src/adapters` (interfaces + dev defaults). Deps: `gridstack`, `@gridmason/protocol`. Nothing else from Gridmason (SDK handle passes through opaquely).

## Data model

LayoutDoc/manifest/context schemas owned by `@gridmason/protocol` (see protocol package). Core-internal: catalog entries, effective-layout structures, adapter `scopeKey = (scope-node|user, pageType, entityId?)`.

## Screens & UX

Core is a library; canonical UX lives in the dashboard mockups (canvas, edit mode, add-widget picker, governance): see `gridmason/dashboard` `docs/specs/dashboard-v0/mockups/01–04`. Canvas/edit-mode/picker behaviors built here must match those mockups' interaction names.

## Epics & issues

Cross-repo protocol: file issues on `gridmason/protocol` for contract gaps; never outside org repos.

### Epic: C-E0 Bootstrap
Goal: releasable empty package with CI and community files.
Depends on: protocol P-E0 published pattern (copy, don't reinvent)

- [ ] Repo scaffold: TS ESM, vitest, lint, CI (build+test; engine-coverage gate), Storybook + Playwright harness stubs
      FRs: FR-17
      Acceptance: CI green; `@gridmason/protocol` 0.x resolves from npm
- [ ] Release pipeline: changesets + npm publish 0.0.x
      FRs: FR-17
      Acceptance: `npm i @gridmason/core@0.0.x` works
      Depends on: Repo scaffold
- [ ] Community files (CONTRIBUTING/SECURITY/CoC/CLA config/LICENSE)
      FRs: —
      Acceptance: CLA check blocks unsigned external PR
      Depends on: Repo scaffold

### Epic: C-E1 Headless model (Phase A)
Goal: catalog + page types + LayoutDoc ops, DOM-free and fully unit-tested.
Depends on: C-E0; protocol P-E1 on npm

- [ ] Widget catalog: registration, source-qualified identity, collision refusal + telemetry event
      FRs: FR-1
      Acceptance: duplicate tag from a second source refused (unit); telemetry adapter called
- [ ] Page-type registry + typed context binding (+ regex escape hatch)
      FRs: FR-2, FR-3
      Acceptance: descriptor from SPEC §3 registers; context type errors surface at registration
- [ ] LayoutDoc operations: migrate-on-read integration, write-back, read-only-on-newer path
      FRs: FR-4
      Acceptance: protocol type vectors pass; newer-version doc renders read-only flag
- [ ] Engine event model + headless API surface docs
      FRs: FR-1..4
      Acceptance: engine layer runs in Node test env with zero DOM globals

### Epic: C-E2 Resolution + gating (Phase A)
Goal: `resolveLayout` with governance, locks, copy-on-write; picker + resolution gating.
Depends on: C-E1

- [ ] `resolveLayout` pure function: 3 levels, most-specific wins, locked-slot merge-down
      FRs: FR-5
      Acceptance: matrix unit tests for all level/lock combinations from SPEC §5
- [ ] Copy-on-write fork + reset-to-default per level (structural diff, not stringify)
      FRs: FR-5
      Acceptance: first edit forks; reset returns upstream; no false forks on reorder-only serialization
- [ ] Picker gating (4 checks) + absent-not-greyed rule
      FRs: FR-6
      Acceptance: each failing check hides the widget; no capability leakage in returned lists
- [ ] Resolution-time gating: silent omission + restore-on-re-enable
      FRs: FR-7
      Acceptance: gate-off round-trip preserves saved layout byte-identically

### Epic: C-E3 Canvas (Phase A)
Goal: gridstack-bound `<gm-page-canvas>` with edit mode, a11y, resilience.
Depends on: C-E2

- [ ] Gridstack binding + custom-element mounting with ABI attrs + lifecycle guarantees
      FRs: FR-8, FR-11
      Acceptance: mounts vanilla test widget; disconnected fires before re-mount (Playwright)
- [ ] Edit mode: drag/resize/add/remove/tabs
      FRs: FR-9
      Acceptance: e2e covers each operation persisting through the persistence adapter
- [ ] Keyboard alternative + a11y landmarks + announcements
      FRs: FR-9
      Acceptance: axe passes in edit mode; keyboard-only e2e moves and resizes a widget
- [ ] Error boundary + skeletons + telemetry attribution
      FRs: FR-10
      Acceptance: crashing widget → fallback card with retry; siblings unaffected (e2e)
- [ ] Virtualization + debounced writes + perf marks
      FRs: FR-15
      Acceptance: 100-widget page hits interactive budget in CI perf smoke
      Depends on: Gridstack binding

### Epic: C-E4 Adapters + IO (Phase A)
Goal: adapter surface, export/import, POC importer, stories + e2e complete.
Depends on: C-E2 (parallel with C-E3 where possible)

- [ ] Adapter interfaces + dev-only default persistence adapter (labeled)
      FRs: FR-12
      Acceptance: conformance-style unit tests a host adapter can reuse; dev adapter warns loudly
- [ ] Export/import + anonymous unavailable-widget degradation
      FRs: FR-13, FR-16
      Acceptance: import with unknown tag shows anonymous card; no tag echo in DOM or telemetry
- [ ] POC importer wiring + fixture
      FRs: FR-14
      Acceptance: real s7k-widgets-core export renders on a demo page type
- [ ] Storybook stories for canvas components + Playwright e2e suite consolidation
      FRs: FR-17
      Acceptance: stories build in CI; e2e suite green and documented

## Milestones

1. **M-A1:** C-E0–C-E2 — headless engine on npm; dashboard can start integrating.
2. **M-A2 (repo exit):** C-E3–C-E4 — dashboard M1 boots on the canvas. This is the Phase A engine deliverable.

## Risks & open questions

- gridstack.js version pin + upstream a11y gaps — may need wrapper work in C-E3 issue 3.
- Perf budget measurement in CI (headless variance) — define smoke methodology in C-E3 issue 5.

## Changelog

- 2026-07-13 — initial draft from the approved engineering spec set.
