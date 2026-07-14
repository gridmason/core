---
'@gridmason/core': minor
---

Add add-widget picker gating (FR-6, SPEC §6). `eligibleWidgets` returns the
catalog entries a page admits, and `isWidgetEligible` — the reusable predicate
layout resolution (FR-7) shares — evaluates all four checks: `requiresContext` ⊆
page context (typed subset via the protocol's `isContextSubset`), `supportsPages`
glob match, gate on, and permission held. Core owns the two typed checks and
orchestrates the gate/permission checks through minimal host ports; a widget
failing any check is **absent, not greyed**, leaking no capability. Glob matching
uses a new dependency-free safe matcher (`matchGlob`/`matchAnyGlob`) that
constructs no RegExp, so a hostile pattern cannot inject or induce catastrophic
backtracking (SPEC §8).
