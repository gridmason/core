---
'@gridmason/core': patch
---

Fix WCAG AA colour-contrast on the widget fallback/error card and make the boundary palette host-themeable.

The fallback card background is now opaque (`#fef2f2`) instead of translucent, so its text contrast no longer depends on the host backdrop, and the message line drops its `opacity` blend — every text pair on the card (title, message, retry) now clears WCAG AA (4.5:1) with no host CSS. Every boundary colour is exposed as a CSS custom property with these AA defaults as fallbacks (`--gm-fallback-bg`, `--gm-fallback-border`, `--gm-fallback-title-color`, `--gm-fallback-message-color`, `--gm-retry-bg`, `--gm-retry-color`, `--gm-retry-border`, `--gm-retry-focus-outline`, and the skeleton tones `--gm-skeleton-bg`, `--gm-skeleton-bar-base`, `--gm-skeleton-bar-highlight`) so a host can theme the card to its design system.
