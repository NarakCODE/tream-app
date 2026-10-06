# DS-02 Typography

Status: proposed consolidation, not implemented. [Overview](00-overview.md) records the approved decisions. [Full inventory](audit-foundations.md) contains counts and paths.

## Existing implementation and defaults

`apps/web/app/layout.tsx:2-15` loads Geist and Geist Mono through Next font variables. `app/globals.css:8-9` maps them to `font-sans` and `font-mono`. Retain both; do not introduce Inter from the disconnected registry foundation. The registry's `--font-geist`/`--font-inter` names do not match the runtime layout's variable names.

Static occurrences: `text-xs` 394, `text-sm` 355, `font-medium` 247, `font-semibold` 58, `text-2xl` 24, `font-mono` 18. Keep 12px for metadata and 14px for interactive/body content: the most-used size overall is metadata, not a reason to shrink body copy. `SettingsShell` uses 24px/500 (`components/common/settings/shared.tsx:28`); retain it as the page heading. Existing 8–11px text in avatars, chart ticks, sidebar footer and key hints should consolidate to 12px, subject to fitting and truncation checks. `text-md` in `settings/shared.tsx:55` is not a standard Tailwind v4 size; replace with an explicit type role.

## Type roles

Sizes and line heights use rem (table assumes default 16px root). The proposal exposes the listed CSS variables; use one role per text element. Weight 400 is the inherited reading default; 500 is the most common explicit weight. Do not set every paragraph to 500.

| Role / token stem            | Size            | Weight | Line height    | Existing utilities              | Checkable use                                                 |
| ---------------------------- | --------------- | ------ | -------------- | ------------------------------- | ------------------------------------------------------------- |
| Caption / `--type-caption-*` | .75rem / 12px   | 400    | 1rem / 16px    | text-xs font-normal leading-4   | Metadata, timestamps, helper and error text; never below 12px |
| Label / `--type-label-*`     | .75rem / 12px   | 500    | 1rem / 16px    | text-xs font-medium leading-4   | Field labels, badge labels and column headers                 |
| Body / `--type-body-*`       | .875rem / 14px  | 400    | 1.25rem / 20px | text-sm font-normal leading-5   | List titles, descriptions and desktop inputs                  |
| Control / `--type-control-*` | .875rem / 14px  | 500    | 1.25rem / 20px | text-sm font-medium leading-5   | Buttons, tabs and navigation items                            |
| Reading / `--type-reading-*` | 1rem / 16px     | 400    | 1.5rem / 24px  | text-base font-normal leading-6 | Long instructions and narrow-screen text inputs               |
| H3 / `--type-h3-*`           | 1.125rem / 18px | 600    | 1.75rem / 28px | text-lg font-semibold leading-7 | Dialog titles and subsections                                 |
| H2 / `--type-h2-*`           | 1.25rem / 20px  | 500    | 1.75rem / 28px | text-xl font-medium leading-7   | Sections containing multiple subsections                      |
| H1 / `--type-h1-*`           | 1.5rem / 24px   | 500    | 2rem / 32px    | text-2xl font-medium leading-8  | One page title in the existing shell                          |

Keep 30px (`text-3xl`) only for the existing authentication/empty-state hero contexts; use 36px line height and weight 600. It is an exception, not the page-title default. Existing 15px/13px article text (`common/issues/details/content-blocks.tsx:117,194`) moves to Reading/Body respectively; retain mono for code. Set code identifiers in Geist Mono at Body size; key hints may use Caption. Use tabular numerals for aligned counts, money, percentages and dates in tables; leave prose proportional. Use normal letter spacing for controls/body; retain `tracking-tight` only for H1/hero headings. Never use `leading-none` for multiline text.

Inputs remain 16px below `md`, 14px at/above `md` as in `ui/input.tsx:11`; search is currently forced to 16px by `globals.css:163-165`. Consolidate search and other inputs through that shared responsive rule; remove the global `!important` only during migration after checking mobile zoom.

## Writing rules

- Use sentence case for page titles, navigation, field labels, statuses and buttons. Preserve proper nouns and user-entered project/team names. Do not uppercase labels with CSS; permit uppercase immutable issue identifiers.
- Button labels start with the action and include the object when ambiguous: “Create issue”, “Save changes”, “Delete team”. Use “Cancel” for abandoning an unfinished form and “Close” for dismissing read-only content. Do not add periods to labels.
- Use ellipses only when opening an intermediate picker/dialog (“Assign to…”), not for the final action. Loading keeps the original button label plus spinner and an announced busy state.
- Field errors name the problem and recovery: “Enter an email address.” or “We couldn’t save the changes. Try again.” Never expose API codes/stack traces as the user message; retain entered values.
- Empty states have a sentence-case title, one sentence explaining scope, and at most one primary action. Distinguish “No issues yet” from “No issues match these filters”; only the latter offers “Clear filters”. Do not offer creation when permissions forbid it.
- Use `Intl.NumberFormat` with the user's locale for display counts and percentages; keep stable machine identifiers unformatted. Show zero as “0”, unknown as “—”, never as zero. Do not round financial values without a domain contract.
- Display dates using the user's locale and configured timezone; use an absolute date/time in a tooltip or accessible description for relative dates. Use ISO 8601 for exports/API boundaries. Persist existing locale/timezone behavior; do not invent a new global format.
- Use one H1 per page, supplied by the shared header where present; do not duplicate it in content. Follow H1 → H2 → H3 without selecting heading semantics for visual size alone.

## Consolidation rules

Replace arbitrary `text-[8px]`, `[9px]`, `[10px]`, `[11px]`, `[0.8rem]` with Caption; `[13px]` with Body; `[15px]` with Reading. Code's `[0.85em]` can remain relative inside rich text through one documented code style. Keep the regular, medium and semibold weights; remove bold from routine controls. Do not rewrite user-authored rich text, external brand marks, or diagram labels by a blind replacement.
