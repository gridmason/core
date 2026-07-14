---
'@gridmason/core': minor
---

Add the widget type catalog (`WidgetCatalog`): manifest-shaped registration keyed
by source-qualified identity `(source, tag)`, define-time collision refusal (a
second source claiming a bound tag, or a duplicate identity, is refused — never a
crash), and a telemetry sink notified on every refusal (SPEC §4, FR-1).
