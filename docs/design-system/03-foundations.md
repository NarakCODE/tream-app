# DS-03 Foundations

Status: proposed. [Inventory](audit-foundations.md) records every lexical value and location; [tokens proposal](tokens-proposal.md) records implementation boundaries.

## Spacing

Tailwind v4 uses a .25rem / 4px base. Keep it. `gap-2` (273 occurrences), `gap-1.5` (171), `gap-1` (95), `px-6` (79), `gap-3` (77) show a dense existing UI. A small scale must retain 6px and 10px for compact controls rather than shifting the whole app to large gaps.

| Token         | Value          | Use                                                         |
| ------------- | -------------- | ----------------------------------------------------------- |
| `--space-0`   | 0              | Reset nested container padding; no negative compensation    |
| `--space-1`   | .25rem / 4px   | Inline icon/text in badges; helper text below input         |
| `--space-1-5` | .375rem / 6px  | Compact selector icon/label gap, existing `gap-1.5`         |
| `--space-2`   | .5rem / 8px    | Default icon/label and toolbar button gap, existing `gap-2` |
| `--space-2-5` | .625rem / 10px | Compact button horizontal padding                           |
| `--space-3`   | .75rem / 12px  | Row padding and regular input horizontal padding            |
| `--space-4`   | 1rem / 16px    | Gap between form fields and dialog content groups           |
| `--space-6`   | 1.5rem / 24px  | Card/dialog/page horizontal padding, existing `px-6`        |
| `--space-8`   | 2rem / 32px    | Separate major content groups in new forms                  |
| `--space-10`  | 2.5rem / 40px  | Settings-section separation, existing `gap-10`              |

Default toolbar gap = space-2. Form label → control = space-1; control → helper/error = space-1; field → field = space-4. Settings rows keep `px-4 py-3`; settings sections keep `gap-10` from `common/settings/shared.tsx`. Dialog padding = space-6; dialog group gap = space-4; footer action gap = space-2. New page gutter = space-6, narrow viewport gutter = space-4. Do not alter `lg:p-2` shell padding (`layout/main-layout.tsx:48`) as part of content spacing cleanup.

Consolidate 1px arbitrary offsets only where they compensate layout errors; borders may stay 1px. Existing space-5/12/16/20/24 and large margins remain legacy layout exceptions until each context is reviewed; do not globally replace them. Dimensions computed from timeline coordinates, sidebar widths or viewport height are geometry, not spacing tokens.

## Radius

Runtime `--radius=.625rem` (10px) maps sm=6px, md=8px, lg=10px, xl=14px. `rounded-md` is most common (126), then full (119), bare rounded (74), lg (48). Retain 8px as the default control corner.

| Token / utility                | Value  | Rule                                                |
| ------------------------------ | ------ | --------------------------------------------------- |
| `--radius-none` / rounded-none | 0      | Flush internal separators/table cells               |
| `--radius-xs` / rounded-xs     | 2px    | Small chart marks only; not controls                |
| `--radius-sm` / rounded-sm     | 6px    | Keyboard hints and compact noninteractive labels    |
| `--radius-md` / rounded-md     | 8px    | Buttons, inputs, selects, navigation rows, popovers |
| `--radius-lg` / rounded-lg     | 10px   | Settings cards, dialogs, inset shell                |
| `--radius-xl` / rounded-xl     | 14px   | Existing Card primitive only during migration       |
| `--radius-pill` / rounded-full | 9999px | Avatars, status dots, switches and genuine pills    |

Bare `rounded` (4px) on controls consolidates to md; checkbox `rounded-[4px]` stays a named `--radius-checkbox` exception (4px) to preserve its 16px visual geometry. Arbitrary 2px chart marks become xs. Registry control/panel/surface radii 18/26/34px are not adopted: its stylesheet is not imported by the app. Standardize the unused Card to lg when adopted; changing its radius now affects zero direct importing screens.

## Elevation

Keep the existing Tailwind shadows rather than increasing dark-mode blur. `shadow-xs` 18 occurrences is the most-used explicit elevation. Use surface color/borders to distinguish sections; do not add shadows to every row.

| Level / token       | Existing value                                                                 | Rule                                           |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| 0 / `--elevation-0` | none                                                                           | Page, list, sidebar, flat settings sections    |
| 1 / `--elevation-1` | `0 1px 2px 0 rgb(0 0 0 / .05)` / shadow-xs                                     | Resting buttons, fields, small raised controls |
| 2 / `--elevation-2` | `0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)` / shadow-md   | Popovers, dropdowns, selects, tooltips         |
| 3 / `--elevation-3` | `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)` / shadow-lg | Modal dialogs, sheets and toasts               |

Legacy shadow-sm/bare shadow on controls → level 1; shadow-sm on containers → level 0 plus border; shadow-xl → level 3. Arbitrary sidebar outline box-shadow is a border emulation, not elevation: migrate to `border-border` and avoid stacking both.

## Layers and breakpoints

Observed z-index counts: z-10 23, z-50 14, z-20 5, z-30 and z-40 1 each. Overlay wrappers in `ui/dialog.tsx`, `sheet.tsx`, `popover.tsx`, `select.tsx`, `dropdown-menu.tsx`, `tooltip.tsx` all use z-50. Preserve portal mechanics; proposal gives distinct semantic tiers to avoid bespoke grid z-50 competing with dialogs.

| Layer token       | Proposed value | Scope                                                      |
| ----------------- | -------------: | ---------------------------------------------------------- |
| `--layer-base`    |              0 | Normal document flow                                       |
| `--layer-sticky`  |             10 | Sticky headers, timeline labels                            |
| `--layer-panel`   |             40 | Nonmodal peek/details panel                                |
| `--layer-overlay` |             50 | Modal scrim and content; content after scrim in portal DOM |
| `--layer-popover` |             60 | Portaled menus/selects, including those inside modals      |
| `--layer-toast`   |             70 | Toast notifications                                        |
| `--layer-tooltip` |             80 | Tooltip for the current interactive surface                |

Values 60/70/80 are explicit proposed additions for overlay ordering, not claims of existing values. Remove arbitrary z-[5]/[6]/[9] in grids in favor of layer-sticky only after confirming sticky-header ordering; do not promote document content above layer-panel. Portals must also be checked for nested stacking contexts in migration.

Retain installed Tailwind breakpoints: sm=40rem/640px, md=48rem/768px, lg=64rem/1024px, xl=80rem/1280px, 2xl=96rem/1536px. Static prefix counts are sm 76, md 54, lg 44, xl 21; zero 2xl usage. `hooks/use-mobile.ts:3` uses 1024px, intentionally lg for sidebar collapse, while fields change size at md. Keep these different behaviors; do not conflate “mobile sidebar” and “mobile text field”. Sidebar expanded width remains 244px, mobile sheet 260px, icon width 3rem (`ui/sidebar.tsx:25-27`); comments saying 16/18rem are inaccurate.

## Interaction geometry and motion

Existing Button sizes are 24/28/32/36/40px, default 36px; Input/Select 36px; sidebar menu 28/32/48px. D3 is approved: keep compact desktop density, with a 24×24px floor for actual targets and 44×44px touch targets. Keep 32px compact rows and 36px default controls; 24/28px variants are reserved for dense desktop toolbars and must meet the floor. For `(any-pointer: coarse)`, expand the actionable wrapper to min-width/min-height 44px, including icon buttons, menu items and checkbox labels. Do not expand only the glyph. Prevent overlaps between neighboring expanded targets.

The proposal defines `--target-min:1.5rem`, `--target-touch:2.75rem`, `--control-height:2.25rem` and `--control-height-compact:2rem`. Applying tokens alone does not implement the target contract; primitive/caller changes are a separate migration increment. A 16px checkbox glyph still needs an associated label target satisfying this policy. Where an actual inline text link uses a WCAG target exception, record that exception rather than claiming it is a 44px control. [WCAG target minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) distinguishes the AA floor and spacing exceptions from the chosen touch policy.

Use the existing transition-color/box-shadow behavior for controls. When reduced motion is requested, remove transform/slide/scale animations and use no transition or opacity only. Central motion tokens already live in `lib/motion-tokens.ts` → `registry/motion-tokens.ts`; importing that TS module is not evidence that registry/foundation.css is active. Do not consolidate motion by importing a second global theme.
