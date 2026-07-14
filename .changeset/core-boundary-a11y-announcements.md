---
"@gridmason/core": minor
---

Announce widget-boundary state changes to assistive technology (SPEC §7, FR-9/FR-10). The per-widget error boundary now speaks the transitions a screen-reader user needs to hear — a widget becoming unavailable (its fallback card), an auto-degrade on latency, and a post-retry recovery — through an opt-in `announce` sink on the boundary config, surfaced on `PageCanvas` as the `boundaryAnnounce` property. A host typically routes it to the same `LiveAnnouncer` the edit-mode a11y layer uses (`canvas.boundaryAnnounce = (m) => announcer.announce(m)`), so one live region serves both. First loads and plain skeleton→ready transitions stay silent to avoid chatter; announcements use only the host-resolved display name (never a tag — SPEC §6/§8). When the sink is wired, the fallback card's inline `role="alert"` is dropped so the failure is not announced twice.
