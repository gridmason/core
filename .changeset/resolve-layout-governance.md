---
'@gridmason/core': minor
---

Add `resolveLayout`, the engine-layer 3-level layout resolution + governance
function (FR-5, SPEC §5). It composes up to three candidate layouts — plugin/host
default, organization published layout, and user personal layout — into one
`EffectiveLayout` under the two governance rules: **most-specific wins** (the
user level overrides org, which overrides default, on a per-slot/per-item basis)
and **locked slots merge down** (a slot locked at the default or org level is
fixed for every level below the one that locked it, so a lower level's attempt to
move, resize, remove, or replace it is ignored). Each level supplies its own
locks — the default level's from the page-type descriptor, the org level's from
the locks it added on publish — and the result reports the effective `lockedSlots`
for the canvas and gating. The function is pure and DOM-free: it never mutates its
inputs and performs no I/O. Copy-on-write forking and reset-to-default (also FR-5)
remain a sibling operation.
