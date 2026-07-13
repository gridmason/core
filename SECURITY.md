# Security Policy

`@gridmason/core` is the **engine** of Gridmason: the framework-agnostic
widgetized page-view core that every host embeds. By design it is a small,
auditable surface — **it loads nothing, injects no scripts, and makes zero
network calls** (SPEC §8). It mounts custom-element tags the host has already
registered; module verification and loading are the host shell's and the
registry's job, not core's. That posture is a security property, and we treat
reports that undermine it accordingly.

## Reporting a Vulnerability

**Do not open a public issue, discussion, or pull request for a suspected
vulnerability.** Public disclosure before a fix is available puts every host
embedding the engine, and their users, at risk.

Instead, report privately through GitHub's coordinated disclosure workflow:

1. Go to the **[Security Advisories](https://github.com/gridmason/core/security/advisories/new)**
   page for this repository (Security tab → Report a vulnerability).
2. Provide as much of the following as you can:
   - Affected version(s) or commit(s), and the affected area (e.g. layout
     import/validation, governance/lock resolution, picker gating, the
     `gridstack` canvas binding).
   - A description of the issue and its security impact (e.g. a layout import
     that leaks the tag or name of an unavailable widget, a governance lock that
     can be bypassed, a picker gate that can be defeated, or any path that gets
     the headless engine to touch the network, the filesystem, or the DOM).
   - A minimal reproduction — ideally a failing unit test or a short script
     against a published `0.x` build.
   - Any known workarounds.

If you cannot use GitHub Security Advisories, contact an administrator of the
[`gridmason`](https://github.com/gridmason) GitHub organization directly to
arrange a private channel.

## What to Expect

- **Acknowledgement** within **3 business days** of your report.
- An initial **assessment and severity triage** within **10 business days**.
- Ongoing updates through the advisory thread as we investigate and prepare a
  fix.
- **Coordinated disclosure**: we will agree on a disclosure timeline with you.
  Our target is a fix and published advisory within **90 days** of triage;
  actively-exploited issues are handled faster. We will credit you in the
  advisory unless you ask us not to.

We do not currently operate a paid bug-bounty program.

## Supported Versions

Gridmason is pre-1.0. Security fixes land on the latest `0.x` line and are
released as a new patch version; there is no long-term support for older `0.x`
releases. Always run the most recent published version.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | :white_check_mark: |
| older `0.x` | :x: |

Once a `1.0` line ships, this table will be updated with a supported-version
window.

## Scope

In scope — anything that gets the engine to violate its stated posture, or that
lets a page do something the governance/gating rules should prevent:

- **Capability leakage**: a layout import or picker path that echoes the tag or
  name of a gated-off, unknown, or unavailable widget instead of degrading to an
  anonymous "unavailable widget" card (SPEC §6/§8).
- **Governance bypass**: a `LayoutDoc` resolution, lock, or slot outcome that
  ignores the page-type governance rules a host relies on.
- **Picker-gate bypass**: add-widget picker logic that offers or admits a widget
  the gating rules should have excluded.
- **Headless-boundary escape**: any input that gets `src/engine` to touch the
  DOM, the network, or the filesystem — or any reintroduction of a
  `<script>`-injection / URL / base64 widget-import path, or of
  `new RegExp(userInput)` (SPEC §8).
- **Unsafe layout import**: a crafted layout that bypasses schema validation on
  import, or that causes unsafe behavior in the `gridstack` canvas binding.
- Supply-chain integrity of the package itself (build, publish provenance,
  dependency pinning).

Out of scope:

- Vulnerabilities whose root cause is in a dependency or a sibling Gridmason repo
  — module verification, signatures, and transparency-log logic live in
  [`@gridmason/protocol`](https://github.com/gridmason/protocol); loading and
  registration live in the host shell and registry. Report those to their
  respective repositories unless the root cause is in `core`.
- Issues requiring a maliciously modified local build of this library.
- Reports generated solely by automated scanners without a demonstrated,
  reproducible security impact.

## Disclosure Philosophy

The engine is deliberately minimal and auditable: it loads nothing, makes no
network calls, and — outside the `gridstack` canvas binding — touches no DOM. Its
job is to resolve layouts and enforce governance and gating **honestly**, without
leaking the existence of widgets a viewer is not entitled to see. If you have
found a way to break that honesty, or to make the headless engine reach outside
its box, we want to hear from you before anyone else does.
