# UI audit report

Read-only source audit of the current Enterprise Automation web UI, 2026-10-05. All app changes already present before this task were preserved. Documentation and unapplied proposals are the only task writes.

## Method and coverage

Scanned 409 source/config files under `apps/web` plus `packages/ui/src`, excluding generated directories and test/spec files. Inventory includes registry, mock data, SVG JSX, CSS/JSON, comments and examples; it is a lexical inventory, not an AST or computed-style audit. There are 71 `page.tsx` route templates, including redirect/stub routes. Reproduce using `python3 docs/design-system/inventory.py` from the repo root.

Occurrence counts measure written tokens/JSX openings, not mounted elements. One class string can contribute several matches; a shared definition is counted once even if hundreds of elements inherit it. JSX aliases, generic syntax, complex nested tags and dynamic construction can be missed. Component name counts do not resolve symbol identity: the four `<Card>` openings refer to a local project-peek Card, **not** the unused `ui/card.tsx` primitive. Importing-file counts and occurrence counts are separately labeled.

Route reach is the unique set of page import closures plus inherited layouts/templates. Shared modules' unused exports can inflate reach; runtime conditions are not evaluated. Package-root exports, unresolved computed imports, not-found/loading/error-only surfaces can undercount. Reach therefore ranks **potential route impact**, not confirmed rendered screen usage. All route sets and path:line occurrences are in [inventory.json](inventory.json). Counts for disconnected registry CSS are included in lexical totals but its reach is zero.

The active stack and source ownership are in [DS-00](00-overview.md). Existing conventions inspected: root `AGENTS.md`, `apps/web/components.json`, `apps/web/eslint.config.mjs`, app package/layout/theme store/applier, runtime primitives, settings shell and domain components. The installed Tailwind theme supplies palette/shadow/breakpoint values. No application tests, lint or build were run for this documentation task. CUA reported zero browser surfaces; rendered contrast, clipping, keyboard traversal, zoom and authenticated route states are **not verified**.

## Inventory index

| Category                                                | Distinct lexical values | Evidence                                                                             |
| ------------------------------------------------------- | ----------------------: | ------------------------------------------------------------------------------------ |
| Color literals/functions, including OKLCH and color-mix |                     364 | [Every value/count/path](audit-colors.md), [proximity groups](audit-color-groups.md) |
| Named/palette color utilities                           |                     163 | [Colors](audit-colors.md); includes opacity suffixes as different values             |
| Inline JSX style expressions                            |                      40 | [Colors](audit-colors.md); all source sites including dynamic geometry/data colors   |
| Typography classes                                      |                      23 | [Foundations](audit-foundations.md); arbitrary typography is in arbitrary section    |
| Spacing classes                                         |                     156 | [Foundations](audit-foundations.md)                                                  |
| Radius classes                                          |                      12 | [Foundations](audit-foundations.md); bracket values are separate                     |
| Shadow classes                                          |                       7 | [Foundations](audit-foundations.md)                                                  |
| Numeric/auto z-index classes                            |                       5 | [Foundations](audit-foundations.md); bracket values separate                         |
| Responsive prefixes used                                |                       4 | sm/md/lg/xl; installed 2xl exists but no use found                                   |
| Bracket syntax rows                                     |                     157 | Arbitrary values **and arbitrary/state variants**; not 157 violations                |
| CSS variable/declaration rows                           |                     414 | [Foundations](audit-foundations.md)                                                  |

Literal white/black may be in assets, overlays, theme definitions or custom data. They are not all dark-mode defects. Alpha colors/functions require their host surface before contrast can be measured. [Color groups](audit-color-groups.md) records the normalization/proximity method and all groups containing competing opaque values.

## Findings ranked by route impact

Reach counts are potential page templates as defined above. For a shared token row, count is its source reach; for component rows, it is that component's import reach. Where a symptom spans several sources, the highest-reach confirmed root is stated rather than inventing a total. Accessibility urgency is shown separately so reach does not hide a small but blocking control defect.

| Rank |                          Reach | Urgency                             | Inconsistency and competing values                                                                                                                                                 | Source evidence                                                                                                                                                                                              | Proposed rule                                                                                                                       |
| ---- | -----------------------------: | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    |                             71 | High                                | Dim focus token: gray-600 ring, usually `/50`; global outline color supplies no outline width. Calculated ring/background 2.57:1, approximately 1.46:1 at 50% opacity              | `apps/web/app/globals.css:78,142-149`; `components/ui/button.tsx:8`; `ui/input.tsx:12`; `ui/select.tsx:30`                                                                                                   | Opaque blue-400 focus token, 2px perimeter/2px offset; remove opacity, check adjacent colors                                        |
| 2    |                             71 | Decision                            | Competing theme/color owners: white primary versus blue-700 sidebar/chart, Magic Blue pale lavender, arbitrary custom accents; secondary root registry theme is disconnected       | `app/globals.css:65-100,191-238`; `components/layout/theme-applier.tsx:54-99`; `store/theme-store.ts:37-45`; `registry/foundation.css:1-156` (0 route reach)                                                 | One source for runtime tokens; D1 retains themes; D2 approves blue primary action                                                   |
| 3    |                             71 | Medium                              | Inline error versus filled destructive foreground shares one role: red-500 on red-900 calculates 2.63:1, while Button/Badge force white labels                                     | `app/globals.css:73-74`; `ui/button.tsx:15`; `ui/badge.tsx:17`; `ui/form.tsx:147`; `ui/alert.tsx:15-18`                                                                                                      | Separate error text from destructive-fill label; use DS-01 pairs; do not claim current white buttons fail                           |
| 4    |           70 (rounded-md uses) | Medium                              | Corner scales compete: rounded-md 8px (126), bare rounded 4px (74), lg 10px (48), xl 14px (11); checkbox 4px and chart 2px exceptions mixed in. Registry 18/26/34px is not runtime | `app/globals.css:36,127-130`; `ui/button.tsx:8`; `ui/checkbox.tsx:14`; `ui/card.tsx:11` (0 direct imports); `common/settings/shared.tsx:81`; full locations in inventory                                     | Default control 8px; panels 10px; named chart/checkbox exceptions; do not flatten avatars/pills                                     |
| 5    |               67 (Button root) | High for undersized targets         | Target size overrides 24/28/32/36/40px; sidebar action 20px, rail 16px, dialog close ~16px. Small glyph size alone is not proof of a target failure where labels enlarge target    | `ui/button.tsx:23-29`; `ui/sidebar.tsx:266-287,395-415,523-552`; `ui/dialog.tsx:69`; `common/issues/details/issue-properties-panel.tsx:91`                                                                   | D3 approves compact desktop/44px touch; expand actual hit areas; inspect spacing exceptions rather than assume all small icons fail |
| 6    |               67 (Button root) | Medium                              | State gaps: hover styles present, no explicit pressed or loading API; native opacity-disabled style differs from token proposal; fields/pickers own no error-message state         | `ui/button.tsx:7-58`; `ui/input.tsx:5-24`; `ui/select.tsx:21-166`; `ui/badge.tsx:7-43`                                                                                                                       | DS-05 states; add caller-owned busy/error semantics; do not invent existing props                                                   |
| 7    | 65 (overlay primitive closure) | Medium                              | Portaled overlay/menu/tooltip all z-50; content also z-50; bespoke z-[5]/[6]/[9], z-10/20/30/40                                                                                    | `ui/dialog.tsx:33,59`; `ui/sheet.tsx:33`; `ui/popover.tsx`; `ui/select.tsx`; `common/issues/issue-grid.tsx`; `common/projects/project-peek-panel.tsx`                                                        | DS-03 named tiers; retain portal/focus behavior and migrate document content below overlays                                         |
| 8    |                 56 (11px uses) | Medium                              | Metadata sizes 8/9/10/11/12px plus relative .8rem/.85em; body 13/14/15/16px; `text-md` has no standard scale meaning                                                               | `common/initiatives/initiatives.tsx:85,166`; `common/teams/members-tooltip.tsx:39`; `layout/sidebar/app-sidebar.tsx:43`; `common/issues/details/content-blocks.tsx:117,194`; `common/settings/shared.tsx:55` | Keep metadata 12 and body/control 14; Reading/input narrow 16; named type roles                                                     |
| 9    |           55 (AppSidebar root) | High                                | Unnamed icon-only external link in shared footer; correctly named theme/sidebar/search controls exist but their practice is not uniform                                            | `layout/sidebar/app-sidebar.tsx:57-65`; good examples `layout/theme-toggle.tsx:47-56`, `ui/sidebar.tsx:248-262`, `layout/headers/issues/header-nav.tsx:128-136`                                              | Add a destination aria-label to Link, decorative icon hidden; inspect all icon-only sites                                           |
| 10   |     55 (status module closure) | Medium                              | Domain blue/lavender and status gray repeats: #6771c5 (16), #5e6ad2 (10), #8f9299 (10), #95a2b3 (12), #facc15 (9), #f2c94c (8); raw green/red plus palette utilities               | `mock-data/status.tsx:123-162`; `mock-data/initiatives.ts:26`; `common/cycles/cycle-burnup-chart.tsx:19-20`; `common/projects/details/project-progress-chart.tsx:14`; `common/issues/label-badge.tsx:15`     | Semantic success/warning/error/info plus preserved domain tokens; label colors stay data exceptions                                 |
| 11   |   17 (violet-fill occurrences) | Medium                              | Selected controls violet-500 rather than primary: checkbox, two filter paths, timeline today marker                                                                                | `ui/checkbox.tsx:14`; `data-table-filter/components/filter-selector.tsx:259`; `filter-value.tsx:423`; `common/projects/projects-timeline.tsx:413`                                                            | Central selection role; D2 mappings; retain all themes; timeline marker keeps semantic “today” identity                             |
| 12   |    12 (settings shared module) | High where focus explicitly removed | Handcrafted triggers use outline-none without a replacement; other native controls use focus:outline-none; relying on base outline color is insufficient                           | `common/settings/shared.tsx:143`; `common/settings/theme-preferences.tsx:74`; `common/issues/assignee-user.tsx:47` (8 reach); `common/issues/details/activity-feed.tsx:135`                                  | Reuse primitive or add shared focus rule; unassigned icon picker also needs explicit name                                           |

A viewport-wide concern also reaches all 71 templates: `app/layout.tsx:61` caps `maximumScale` at 1. Remove the cap in a later accessibility change and verify 200% zoom/reflow; browser behavior varies, so this is an authoring restriction with runtime impact unverified.

## Component usage and state inventory

Importing-file counts below were gathered separately by component-module imports and exclude the defining file; they differ from JSX occurrence counts. Names can be local wrappers: consult source identity before migrating.

| Runtime primitive   | Importing files | Actual state coverage / gap                                                          |
| ------------------- | --------------: | ------------------------------------------------------------------------------------ |
| Button              |              95 | default/hover/focus/disabled/aria-invalid; no loading prop/pressed rule              |
| Sidebar             |              39 | hover/focus/active/disabled/open/collapse; rail keyboard alternative must be checked |
| Popover             |              27 | open/closed and Radix focus behavior; query states in caller                         |
| Input               |              23 | default/focus/invalid/disabled; label/helper/error/loading in caller                 |
| Select              |               6 | default/placeholder/focus/disabled/selected/open; caller error/load/empty            |
| Dialog              |               5 | open/closed, close label, focus mechanics; caller async/error                        |
| Badge               |               4 | four variants; link hover and generic invalid/focus classes; no semantic status API  |
| Textarea            |               2 | field states; no loading/error-message API                                           |
| AlertDialog / Sheet |          2 each | open/closed; native/Radix controls; caller async/error                               |
| Table               |               1 | row hover/selected; feature sort/pagination/empty/error/load                         |
| Card                |               0 | Static wrapper; local peek-panel Card is a separate implementation                   |
| Sonner              |               1 | Root-mounted Toaster; action/dismiss; no enforced persistent error policy            |

Complete anatomy, use/not-use and accessibility contracts: [DS-04](04-component-usage.md). Existing prop/state detail and all seven requested states: [DS-05](05-components.md). Empty states are feature-owned, not a universal primitive. Runtime empty/loading/error behavior is visible in source, not interactively verified.

## Dark-mode gaps and deliberate exclusions

- Hardcoded violet/blue/red/gray utilities bypass custom theme roles. Ordinary text in `AssigneeUser` uses `text-zinc-600`, potentially dim on dark backgrounds. White/video overlays in `details/content-blocks.tsx:77-80` depend on media behind them; contrast cannot be certified without compositing/rendering.
- Custom-theme foreground uses a brightness threshold, not a contrast calculation; generated border/accent/ring colors are unbounded. No finite dark reference matrix certifies every custom theme.
- Theme preview swatches intentionally use inline colors (`settings/theme-preferences.tsx:25-31,54,107`). Those display the palette being selected, not an unthemed screen background. Keep a documented swatch exception.
- Integration/logo SVG colors and user label dots carry identity. Inventory them, but do not merge into blue as a generic UI fix. Dynamic width/transform styles in timelines/progress/resizable layouts are geometry, not color violations.
- Transparent inputs inherit host backgrounds; they are themed if the host is themed. The issue is validating each host, not automatically filling every input.
- The registry's `--focus-ring:transparent` is an accessibility problem if that stylesheet is activated, but it has zero discovered application stylesheet reach. Do not report it as the currently rendered app focus policy.

## Decisions and proposed consolidation

| Category           | Existing default retained                                                                | Consolidation / approved choice                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Colors             | Zinc background/foreground/sidebar/accent, #101011 inset surface                         | Separate status/error/focus roles; D1 retains themes; D2 approves blue action mapping     |
| Typography         | Geist/Geist Mono, 12px metadata, 14px body/control, 24px page title, explicit 500 weight | Collapse tiny arbitrary labels and 13/15px body; retain 16px mobile input                 |
| Spacing            | 4px base; 8px default gap, 6px compact gap, 24px page padding                            | Small contextual scale in DS-03; 16px form gap; no blind geometry replacement             |
| Radius             | 8px controls                                                                             | 10px panels; pills preserved; named 2px chart/4px checkbox exceptions                     |
| Elevation          | shadow-xs resting controls                                                               | none/md/lg for flat/floating/modal; remove unrelated intermediate blur levels             |
| Layers/breakpoints | z-10 sticky/z-50 modal; existing sm/md/lg/xl; lg sidebar collapse                        | Add 60/70/80 overlay subtiers; migrate literal content layers incrementally               |
| Controls           | Current 36px field/Button default and existing APIs                                      | D3 compact desktop/44px touch policy; standardize states without claiming new props exist |

All product decisions are recorded in DS-00: retain themes with dark reference, blue primary actions, compact desktop/44px touch targets. The documentation and patch incorporate them; the patch remains unapplied as requested. [Migration plan](migration-plan.md) orders fixes by reach and assigns sizes.

## Contrast exceptions found while retaining themes

The source light muted-foreground (gray-500) calculates about 4.49:1 on its default background and 4.39:1 on the accent surface. Pure Light has the same accent failure. The proposal deliberately deepens this role to gray-600. In Magic Blue, a reference gray-500 input boundary would be 2.78:1 against accent; use gray-400 there. These accessibility exceptions override most-used-value retention only for the affected semantic role. All proposed enabled text pairs pass 4.5:1 and required boundary/focus pairs in the documented fixed-theme matrices pass 3:1. This does not certify custom generated colors or existing opacity consumers.

## Documentation validation

- `git apply --check docs/design-system/tokens-proposal.patch` passed against the current working tree. The patch was not applied.
- Relative deliverable links were checked; none were broken.
- Token contrast matrices were calculated with the included `color_math.py`; no enabled text pair in the documented fixed-theme matrices is below 4.5:1 and no documented required focus/input boundary pair is below 3:1. Disabled-only rows are explicitly exempt.
- `apps/web/app/globals.css` and `apps/web/eslint.config.mjs` have no task changes. Existing app/server edits remain preserved. No runtime/browser, application test, lint or build pass is claimed.
