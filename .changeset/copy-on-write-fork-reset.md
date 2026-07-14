---
'@gridmason/core': minor
---

Add copy-on-write fork + reset-to-default per level (FR-5, SPEC §5), the write
side of the three-level governance model. `forkOnEdit(inherited, edited)` decides
whether a user's edit of an inherited layout genuinely differs from what they were
viewing: if so it returns a detached personal copy to store at the user level, and
if not the user keeps inheriting. `resetLevel(inputs, level)` drops a level's
personal layout so resolution falls back to the upstream document, preserving any
governance locks the level declared. The fork decision runs on a new **structural
diff** (`layoutsEqual` / `gridsEqual` / `structuralEqual`) that replaces the POC's
`JSON.stringify` hash: it is insensitive to object key order and to item ordering
within a grid, so reloading and re-serializing an inherited layout never spuriously
forks. The persistence `ScopeKey` shape `(scope-node | user, pageType, entityId?)`
and its canonical `scopeKeyString` are defined here (the adapter itself is C-E4).
All operations are pure and DOM-free, surfaced through `@gridmason/core/engine`.
