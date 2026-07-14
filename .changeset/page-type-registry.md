---
'@gridmason/core': minor
---

Add the page-type registry (`PageTypeRegistry`) with typed context binding.
Page-type descriptors register with an `id`, a typed `context` map, an optional
`default_layout`, slot `locks`, and `allow_user_customization`; the declared
context is validated against the `@gridmason/protocol` context-type grammar at
registration time, so a malformed descriptor fails up front rather than at
resolution or mount. A migration-only regex escape hatch (`pages`) is retained
verbatim for porting POC route-regex pages (matched later by the picker's safe
matcher, never `new RegExp(userInput)`).
