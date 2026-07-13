# SPEC — `@gridmason/core` (the engine)

**Repo:** `gridmason/core` · **Package:** `@gridmason/core` · **License:** AGPL-3.0 (CLA required) · **Status:** draft v0.2 · **Project:** [Gridmason](https://github.com/gridmason/.github)

The framework-agnostic widgetized page-view engine. Everything above the grid, below the host application: widget catalog, typed page contexts, layout resolution + governance, tabs, locks, share/import. **Zero host-specific code** — the embedding application supplies adapters (persistence, gates, permissions, telemetry). Successor to the `s7k-widgets-core` proof of concept: concepts ported, code rebuilt framework-agnostic.

## 1. Scope

**In:** grid canvas (gridstack.js), headless layout engine, widget type catalog, page-type model, 3-level layout governance, edit mode, add-widget picker logic, settings editing, layout export/import, adapter interfaces.

**Out (explicit non-goals):** module loading/verification (→ registry + host shell), network I/O (widgets use the host SDK; core makes zero network calls), persistence backends (adapter), authn/authz (adapter), visual design beyond structural CSS (hosts theme via CSS custom properties; the dashboard ships a default Gridmason theme).

## 2. Architecture

```
@gridmason/core
├── engine/          headless, DOM-free, 100% unit-testable
│   ├── catalog      widget type registry (manifest-shaped entries)
│   ├── layout       LayoutDoc model + resolution pipeline + governance
│   ├── placement    first-fit auto-placement, collision, constraints
│   └── picker       gating: context ⊆ page ∧ pages match ∧ gate ∧ permission
├── canvas/          gridstack.js binding; mounts custom elements
│   ├── PageCanvas   <gm-page-canvas page-type context> custom element
│   ├── edit-mode    drag/resize/add/remove/tabs; keyboard alternative
│   └── boundary     per-widget error boundary → fallback card
└── adapters/        interfaces only; host implements
    persistence · gates · permissions · telemetry · settings-form
```

Grid engine = **gridstack.js** (MIT, vanilla JS/TS — custom-element widgets from any framework drop in natively; React-coupled grid libraries were rejected because they break the framework-agnostic contract). Grid geometry `{x,y,w,h,i}` carries over from the POC unchanged.

The **engine layer never touches the DOM** — it operates on `LayoutDoc` JSON and emits change events. The canvas layer is the only DOM consumer. This is the POC's two-manager split (WidgetManager / LayoutManager) hardened into a headless core.

## 3. Page model — every page is widgetized

Every route renders a page canvas. **No exceptions — a "fixed" page is a locked layout.** Full-canvas tools (a map, a flow editor) are a default layout of one maximized locked widget; same system, no special case.

Page-type descriptor (registered by the host or by plugins; schema in `@gridmason/protocol`):

```yaml
page_type:
  id: crm.customer-detail
  context:
    record: {type: record-ref, recordType: customer}   # typed context the page provides
  default_layout: layouts/customer-detail.json          # the "designed" look
  locks:
    - {slot: header-summary, locked: true}              # mandatory immovable widget
    - {maxColumns: 12, allowTabs: true}
  allow_user_customization: true                        # false = fully locked page
```

**Typed page contexts are the contract.** Widgets on a customer page receive `context.record`; on a team dashboard, `context.team`. Context types are declared in `@gridmason/protocol`; hosts register their own. This replaces the POC's raw route-regex `pages: [".*"]`; a regex escape hatch is retained for migration.

## 4. Widget definition

Evolves the POC `ManagedWidget` (id, component, defaultProps, w/h, thumbnail) → manifest-registered custom element:

```yaml
widget:
  tag: acme-sales-chart                 # custom-element tag = identity; MUST be publisher-prefixed
  name: "Sales Chart"
  requiresContext: {record: {recordType: customer}}
  supportsPages: [crm.customer-detail, dashboards.*]   # explicit allow, glob
  size: {default: [4,3], min: [2,2], max: [12,8]}
  props: schemas/sales-chart.json       # JSON-schema'd user settings
  thumbnail: assets/sales-chart.png
```

**Widget ABI (custom element):**
- Attrs in: `context` (serialized typed page context), `settings` (saved per-instance props), `instance-id`, `edit-mode`.
- Events out: DOM `CustomEvent`s (e.g. `gm:action`); cross-widget comms via the host SDK's typed event bus.
- Host SDK handle supplied by the shell at mount; **core passes it through opaquely** (interface in `@gridmason/sdk`).
- Lifecycle: the engine guarantees `disconnectedCallback` runs before an instance is removed or re-mounted (layout change, tab switch, gate flip); widgets MUST release resources there (timers, observers, listeners). Event-bus subscriptions made through the SDK handle are auto-released on unmount (sdk §3 rule 6), so a well-behaved widget's only cleanup burden is what it allocated outside the SDK.
- Settings UX: widget may register a settings element; fallback = JSON-schema-driven form (adapter renders it in the host's design system). POC pattern kept.

Type identity (`tag`) vs instance identity (`i` uuid) with per-instance `props` in the layout — POC model kept.

**Tag namespace:** custom-element tags share one per-document namespace and `customElements.define` throws on collision. Tags MUST be publisher-prefixed (`<publisher>-<widget>`); registry manifest lint enforces it. A define-time collision refuses that remote with telemetry — never a crash.

**Widget identity is source-qualified.** Publisher prefixes are only unique *within* one registry, and a host may trust several registries plus sideloads — so the bare tag is not identity. Identity = `(source, tag)`, where `source` names the registry (or `sideload:<origin>`, or `local`). At resolution the engine binds each tag to its saved source; a remote from any *other* source claiming a bound tag is refused (with telemetry) — a saved instance can never be silently impersonated and handed its predecessor's context/settings.

## 5. Layout model + 3-level governance

`LayoutDoc` (versioned JSON, `schemaVersion` field — the POC had none):
`LayoutPage {page, name, default, grid, hasTabs, tabs[]}` → `LayoutTab {name, grid}` → `LayoutGrid {items[]}` → `LayoutWidget {widgetID: {source, tag}, i, x, y, w, h, props, slot?}`.

- **`widgetID` is source-qualified** (`{source, tag}`, §4) — layouts survive multi-registry hosts without tag-squatting; an instance only ever mounts the widget from the source it was saved with.
- **`slot`** — optional stable role identifier, unique per page; page-type `locks` (`{slot: header-summary, locked: true}`) bind to it, so a lock follows the instance wherever governance places it.
- **Migration = migrate-on-read.** One migrator per `schemaVersion` step; older docs upgrade in memory, persistence writes back current. An *unknown newer* version renders read-only with a warning — never a destructive rewrite. A POC (`s7k-widgets-core` localStorage) importer ships in M3.

Resolution pipeline:

```
plugin/host default (ships with the page type)
  → organization published layout (per org node, per role; may add locks)
    → user personal layout (per pageType, optionally per specific entityId)
```

Rules: **most-specific wins; locked slots merge down and cannot be overridden below the level that locked them.** Reset-to-default at every level. Copy-on-write: first user edit of an upstream layout forks a personal copy (POC pattern; structural diff replaces the POC's `JSON.stringify` hash comparison). Publish-down-the-tree (an admin pushes a standard dashboard to every team) is host plumbing; core exposes `resolveLayout(inputs) → EffectiveLayout` as a pure function.

Persistence is an adapter: `get/put(scopeKey)` where `scopeKey = (scope-node|user, pageType, entityId?)` — any KV store fits. The bundled default adapter is in-memory + localStorage, dev-only and clearly labeled.

## 6. Add-widget picker gating

Picker shows only widgets where **all four** hold:

1. `requiresContext` ⊆ page context (typed subset check),
2. `supportsPages` glob matches the page type,
3. widget's gate is on (gates adapter),
4. user has the widget's data permissions (permissions adapter).

Core implements 1–2 and orchestrates; 3–4 are adapter calls. A widget failing 3 or 4 is absent, not disabled-greyed (no capability leakage).

**The same four checks run at layout resolution**, not just in the picker: a persisted instance whose gate is now off (or whose data permission is gone) is silently omitted from the effective layout — the saved layout is untouched, so re-enabling restores it. No named placeholder for gated-off widgets (that would leak capability); only a *load failure* of an entitled widget gets the error-boundary fallback card.

## 7. Runtime, resilience, NFRs

- **Per-widget error boundary**: a widget that throws or fails to load renders a fallback card (name + retry); canvas and siblings unaffected. Slow widgets get skeletons; **the canvas never blocks on widget code**.
- Perf: virtualize offscreen widgets on long pages; debounce layout writes; **p95 canvas interactive < 300 ms after data**.
- A11y: keyboard drag alternative (move-mode + arrow keys), widget landmarks, edit-mode announcements — **WCAG 2.1 AA holds in edit mode**.
- Telemetry adapter: per-widget error + latency attribution (host may auto-degrade a widget exceeding budgets to its fallback).

## 8. Security posture

Core loads **nothing**. It mounts custom-element tags the host has already registered (host shell + registry handle verification/loading). No `<script>` injection APIs, no URL/base64 widget import — the POC path is deliberately absent. No `new RegExp(userInput)` (glob matching via safe matcher). Layout JSON validated against schema on import; import of a layout referencing unknown tags degrades to anonymous "unavailable widget" cards (no tag/name echo — consistent with the no-capability-leakage rule in §6).

## 9. Package + repo

- Publishes `@gridmason/core` (ESM + types; changesets; SemVer with deprecation windows). **License: AGPL-3.0 (GW-D8); all contributions require the CLA.**
- Repo: `src/engine`, `src/canvas`, `src/adapters`; a Storybook story per component (no story, no merge — advisory pre-1.0, GW-D20); unit tests for the entire engine layer (hard gate); Playwright e2e for the canvas.
- Depends on: `gridstack`, `@gridmason/protocol` (context + manifest + LayoutDoc types). No dependency on the registry, the SDK implementation, or any host.

## 10. Milestones

0. **M0 (in `gridmason/protocol`)** — page-context, manifest, and LayoutDoc schema types published; core pins them.
1. **M1 — headless engine**: LayoutDoc + resolution + governance + picker gating, 100% unit-tested, no DOM.
2. **M2 — canvas**: gridstack binding, edit mode, error boundaries, a11y.
3. **M3 — adapters + export/import** (incl. POC importer), Storybook, docs site seed.
4. Exit: the Gridmason Dashboard boots on it.
