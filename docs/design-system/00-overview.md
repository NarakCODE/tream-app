# DS-00 Overview

This is an extraction and proposed consolidation of the Enterprise Automation app's current UI, dated 2026-10-05. Application code is unchanged. Rules in this directory are a migration target, not a claim that the app already conforms. The product owner approved retaining all themes with dark as the reference, blue primary buttons, and compact desktop controls with 44px touch targets.

## Start here

| Document                                                                                                                                                               | Purpose                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Audit report](audit-report.md)                                                                                                                                        | Ranked inconsistencies, competing values, source evidence, limitations |
| [Color](01-color.md)                                                                                                                                                   | Existing palette anchors, proposed semantic roles, calculated contrast |
| [Typography](02-typography.md)                                                                                                                                         | Type scale and writing rules                                           |
| [Foundations](03-foundations.md)                                                                                                                                       | Spacing, radius, elevation, layers, breakpoints                        |
| [Component usage](04-component-usage.md)                                                                                                                               | Anatomy, behavior, component selection, accessibility                  |
| [Components](05-components.md)                                                                                                                                         | Actual props and existing versus proposed state contracts              |
| [Token proposal](tokens-proposal.md)                                                                                                                                   | Unapplied patch matching the approved direction                        |
| [Agent rules](agent-rules.md)                                                                                                                                          | Proposed rules for AGENTS.md/CLAUDE.md/Cursor                          |
| [Lint suggestions](lint-suggestions.md)                                                                                                                                | Incremental enforcement, exceptions and rule scope                     |
| [Migration plan](migration-plan.md)                                                                                                                                    | Fix order, scope, sizes and acceptance criteria                        |
| [Color inventory](audit-colors.md), [foundation inventory](audit-foundations.md), [component counts](audit-component-counts.md), [color groups](audit-color-groups.md) | All lexical values, usage counts and source paths                      |
| [Machine inventory](inventory.json), [scanner](inventory.py)                                                                                                           | Full occurrence locations and route reach; reproducibility             |

## Existing stack and ownership

- Next.js 15.2.8 / App Router in `apps/web`, React from the workspace catalog. Dependencies are declared in `apps/web/package.json`; the dependency range is not an assertion that the lockfile resolves the same version.
- Tailwind v4 CSS-first theme; no JS Tailwind config. `components.json` specifies shadcn new-york/zinc, CSS variables, and `app/globals.css` as the theme source. Radix provides interactive primitives, CVA provides variants, `cn` merges classes.
- Runtime UI primitives live in `apps/web/components/ui`. Domain components live in `components/common`, newer API-driven slices in `features`, chrome in `components/layout`.
- `globals.css` holds light/dark and named theme tokens. `theme-provider.tsx`, `theme-applier.tsx`, and `store/theme-store.ts` control resolved theme and custom overrides. The root layout requests dark by default; the theme store defaults to system, so application preferences can override it.
- `registry/foundation.css` defines another theme, fonts, radii and a transparent focus token. No app stylesheet import was found for this foundation. `lib/motion-tokens.ts` imports registry TS motion tokens; that does not activate the registry CSS. Keep registry evidence separate from runtime adoption.
- `@repo/ui/splash-screen.css` is globally imported. Shared-package UI affects web bootstrap and is included in the source inventory, without promoting app-only tokens to a shared package.

## Principles and tone

1. Preserve current geometry: cool deep zinc surfaces, compact rows, Geist typography, 8px control corners and existing inset shell. A rule changing these defaults must cite a specific use case and affected routes.
2. Use blue for the primary brand role from the already installed blue family. Whether primary action fills change is D2; never equate chart/status lavender with brand color without checking its domain meaning.
3. Separate semantic roles from palette values. A component requests background, muted-foreground, input, ring or error; only the token source assigns a literal color. External logos and user label colors use reviewed data exceptions.
4. Use one shared primitive per interaction. Add behavior to the runtime primitive or a narrow domain wrapper; do not import registry button/dialog to get a different look or `loading` prop.
5. Make hierarchy measurable: use the typography roles, spacing relationships and component state tables in DS-01–05. New styles must use a documented role or add a reviewed role with evidence.
6. Support keyboard and async states as first-class behavior: named controls, visible focus, disabled/loading/error distinctions, and text plus icon for status.

Use concise, literal language describing the user's action and result. Preserve enterprise domain terminology, team names and identifiers. Do not introduce marketing copy into settings, errors, empty states or navigation.

## Product decisions

All three questions were answered in this task. These decisions define the proposal; they do not authorize applying the patch in this documentation-only task.

| ID  | Approved answer                      | Checkable contract                                                                                                             |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Retain themes; dark is the reference | Preserve light/system/Pure Light/Magic Blue/Classic Dark/custom preferences; validate each fixed theme and custom combinations |
| D2  | Make primary buttons blue            | Use blue-700 default, blue-600 hover, blue-800 pressed, gray-50 labels in every fixed theme                                    |
| D3  | Compact desktop; 44px on touch       | Keep 32px compact rows and 36px default controls; desktop targets at least 24×24px; touch targets at least 44×44px             |

The neutral palette, font family, most-used radius and spacing base are not ambiguous and are preserved. Component semantics and required accessible names/focus/contrast are requirements, not optional appearance choices. Domain label colors retain their meaning until the owning feature establishes a mapping.

## Contribution and exceptions

Before changing UI, locate the runtime component, token source, host surface and route owner. Reuse the existing primitive and semantic variant. Document a new token with value, role, usage example, permitted foreground/background pairs and contrast; add it to the single token source and DS document together. Check affected default/hover/focus/pressed/disabled/loading/error states before merging.

An exception record must contain owner, path, purpose, value, affected states, contrast result where relevant, and a removal trigger. Exceptions for integration logos, user label data and dynamic chart geometry belong in their data boundary, not in a general “allow arbitrary values” list. Do not treat existing violations as approval for new violations. Do not activate the proposed agent or lint policies as part of this documentation-only task.

## Evidence boundary

Source audit covers current working-tree files, including pre-existing edits and untracked feature files. The scanner finds 409 source/config files and 71 page route templates. Counts are static lexical occurrences; route reach is transitive import/layout reach, not a count of rendered screens or users. The full method and limitations are in the audit. No browser surface was exposed, so screenshots, keyboard traversal, zoom, runtime contrast and authenticated theme rendering remain unverified. No app tests, lint or build were run for this docs-only task.
