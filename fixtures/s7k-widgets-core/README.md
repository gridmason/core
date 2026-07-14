# `s7k-widgets-core` POC fixture

`dashboard-export.json` is a real localStorage dump from the proof-of-concept
[`Sniper7Kills-LLC/s7k-widgets-core`](https://github.com/Sniper7Kills-LLC/s7k-widgets-core):
the exact JSON value the POC persists under its localStorage key `$widgetLayouts`
(`src/managers/layout.ts` → `localStorage.setItem('$widgetLayouts', JSON.stringify(savedLayouts))`).

It is the checked-in input for the POC importer (FR-14): read the string out of
storage, `JSON.parse` it, and hand it to `importPocLayouts`, which converts the
legacy pages into current-version `LayoutDoc`s via `@gridmason/protocol`'s
importer contract (protocol FR-6).

## Shape (verbatim from the POC)

An array of `LayoutPage`, each `{ id, page, name, default, grid, hasTabs, tabs[] }`
(`src/types/layout.d.ts`). A widget is a POC `LayoutWidget`
(`{ name, widgetID, x, y, w, h, i, props? }`, plus the `moved` flag gridstack
writes at runtime). Note the POC's per-node uuids (`id`), the `name`/`moved`
presentation fields, and the *bare* `widgetID` — the importer source-qualifies
each bare tag to `{ source: 'local', tag }` and drops the fields with no home in
`LayoutDoc v1`.

## What it exercises

- **`index`** — a single-grid page with two host-known widgets (`acme-clock`,
  `acme-notes`, one carrying per-instance `props`) and one widget a host that
  only registered the two does **not** have (`acme-market-ticker`), which
  degrades to the anonymous unavailable-widget card.
- **`reports`** — a tabbed page; its `Legacy` tab references a widget by a bare
  uuid `widgetID` (the POC default), another no-catalog-match that degrades.
