---
"@gridmason/core": patch
---

Fix `<gm-page-canvas>` widgets rendering collapsed to content width on their first client-side mount (#63). When an SPA host mounts the canvas into a freshly-attached container and drives it imperatively, gridstack places the items before the browser has laid the containing block out, so each item's percentage width (`calc(w * var(--gs-column-width))`) resolves as `auto` and Chromium keeps that stale resolution until a much later reflow (a ~1.5s self-correct or a window resize). The canvas now watches the grid host for its first real layout box (a one-shot `ResizeObserver`) and, once it has one, re-resolves the item widths by cycling gridstack's `--gs-column-width` property on the host — so items are correctly sized on first paint with no resize crutch. The fix is inert where the box is already laid out (SSR/static) and where `ResizeObserver` is unavailable; render, mount, and `gm:rendered` timing are unchanged.
