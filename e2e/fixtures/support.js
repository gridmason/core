// Shared browser-side helpers for the canvas e2e fixtures (docs/testing.md).
//
// Every canvas fixture boots the built `@gridmason/core` ESM under the same
// inline import map (gridstack → the UMD global, `@gridmason/protocol` → its ESM
// dist) — that map is document-scoped and must precede the module graph, so it
// stays inline in each fixture's <head>. What the fixtures needlessly repeated is
// the `EffectiveLayout` envelope and the demo record context; those live here so
// the mounting, edit-mode, and keyboard/a11y fixtures share one definition. Each
// fixture's widget classes and `window` control surface stay in the fixture —
// they are the behavior its spec asserts.

/** The demo record context every canvas fixture mounts under. */
export const DEMO_CONTEXT = { record: { recordType: 'customer', id: '42' } };

/** A single-grid effective layout over `items`, with optional locked slots. */
export const single = (items, lockedSlots = []) => ({
  layout: {
    schemaVersion: 1,
    page: 'demo',
    name: 'Demo',
    default: true,
    grid: { items },
    hasTabs: false,
    tabs: [],
  },
  lockedSlots,
});

/** A tabbed effective layout: `[{ name, items }]` → one grid per tab. */
export const tabbed = (tabs, lockedSlots = []) => ({
  layout: {
    schemaVersion: 1,
    page: 'demo',
    name: 'Demo',
    default: true,
    grid: { items: [] },
    hasTabs: true,
    tabs: tabs.map((t) => ({ name: t.name, grid: { items: t.items } })),
  },
  lockedSlots,
});
