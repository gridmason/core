---
'@gridmason/core': minor
---

Add resolution-time gating (FR-7, SPEC §6): the add-widget picker's four checks
now re-run on a resolved layout's **persisted** instances via the shared
`isWidgetEligible` predicate. `gateResolvedLayout` takes an `EffectiveLayout`
(plus the page, a `WidgetManifestSource`, and the same gate/permission ports the
picker uses) and returns a new effective layout with every instance that is now
gated off, unpermitted, or context/`supportsPages`-mismatched **silently
omitted** — no named placeholder, so no capability leaks. Omission is a view-time
filter, never a write: the saved `LayoutDoc` is untouched, so re-enabling a gate
or restoring a permission includes the instance again on the next resolution (a
lossless round-trip). An instance whose type the host cannot resolve is a *load
failure*, kept for the C-E3 fallback card rather than omitted. `resolveAndGateLayout`
composes governance resolution and gating in one pure, DOM-free call.
