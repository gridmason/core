---
'@gridmason/core': minor
---

fix(canvas): keyboard landmarks for widgets mounted lazily under virtualization

With `PageCanvas.virtualize` on, a widget mounted lazily as it scrolled into view
never became a keyboard landmark: the a11y layer only (re)applied landmarks on the
full-render `gm:rendered` event, but a virtualizer mount happens *between* renders,
so a scrolled-in widget stayed unfocusable / not tab-reachable until an unrelated
full render.

`PageCanvas` now dispatches two additive, per-widget lifecycle events under
virtualization — **`gm:widget-mounted`** (`CANVAS_WIDGET_MOUNTED_EVENT`) and
**`gm:widget-unmounted`** (`CANVAS_WIDGET_UNMOUNTED_EVENT`), each with
`detail.instanceId` (`CanvasWidgetLifecycleDetail`) — the scroll-driven complement
to `gm:rendered`. The keyboard/a11y controller listens for them: it landmarks a
lazily-mounted widget at once (so a scrolled-in widget is immediately keyboard-
reachable) and, on unmount, rescues focus if the scrolled-out widget held it and
then drops its landmark. A keyboard landmark now tracks mount state — an offscreen,
torn-down widget is not a Tab stop and regains its landmark when scrolled back in.

Also reconciles the `CanvasRenderedDetail.instanceIds` doc: it is every instance
**placed** on the active grid (in placement order), not the mounted subset — under
virtualization a placed item may be offscreen and unmounted yet still listed
(read `mountedInstanceIds` for the mounted subset). Payload unchanged.
