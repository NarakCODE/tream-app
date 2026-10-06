# Single token source proposal

Status: unapplied. Review [tokens.proposed.css](tokens.proposed.css) and [tokens-proposal.patch](tokens-proposal.patch). Neither is imported into the app from its documentation location. The proposal incorporates all three approved [product decisions](00-overview.md): retain themes, blue primary buttons, compact desktop/44px touch targets.

## Ownership and patch

Create `apps/web/app/styles/tokens.css` as the only literal UI token source. Import it from `apps/web/app/globals.css` after Tailwind and splash CSS. Move existing root/dark/named-theme declarations into it; keep globals' Tailwind aliases and base rules. The patch contains this extraction plus proposed fixed-theme semantic role overrides and foundation tokens. It was generated against the current working-tree CSS, not a clean base commit; regenerate if that file changes before migration.

The preview includes the primitive zinc/blue scales and semantic values in DS-01, type roles in DS-02, spacing/radius/elevation/layer/target roles in DS-03. Preserve existing light/named-theme **surfaces** and complete their readable roles. Primary now maps to blue-700, hover blue-600, pressed blue-800, with gray-50 text in every fixed theme. Dark remains the reference; user-selectable themes and persisted preference keys remain supported.

Light/Pure Light muted text moves from gray-500 to gray-600 because the current value narrowly fails 4.5:1 on several host surfaces. Magic Blue's required input boundary uses gray-400 instead of the reference-dark gray-500 because gray-500 fails 3:1 against its accent surface. These are explicit contrast-driven exceptions to retaining the most-used value. All fixed-theme proposed pair matrices are in DS-01. Custom themes cannot be certified by a finite table; validate the generated pairs and prevent the current inline custom `--primary` override from defeating the approved blue action role.

CSS literals belong in this source; external/user colors belong behind a reviewed data API. Existing `--radius` and aliases remain compatible with current classes. Add `--target-min=24px`, `--target-touch=44px`, `--control-height=36px`, and `--control-height-compact=32px` for the approved geometry contract. Their presence alone does not enlarge existing targets.

## Implementation dependencies

The token proposal is not a completed migration. Button still uses `/90` hover; focus still uses ring/50; checkboxes select violet; raw chart/domain colors remain; active/loading states and layer utilities need consumer changes. The migration plan sequences these changes.

`FormMessage` and `Alert` currently use destructive-foreground for inline error text, while Button/Badge use explicit white labels. Split inline errors to text-error when adopting the filled-destructive foreground contract. Do not land the token change alone and call status/error migration complete. Replace existing hover opacity with the approved action-hover token; replace ring opacity with the opaque focus token. Validate all retained themes after these consumer changes.

Custom theme generation currently overrides primary/input/ring via inline style and uses a brightness heuristic for readable labels. Keep custom theme controls, surfaces and sidebar preferences, but migrate the generator to the approved primary state roles and validated contrast. Treat this as a required companion implementation, not an unmentioned consequence of a stylesheet extraction. Do not import registry/foundation.css: it adds a competing root theme and transparent focus policy.

## Future application review

1. Regenerate the patch if source CSS changed; compare token preview, DS tables and fixed-theme mappings.
2. Apply in a separately authorized implementation task together with necessary focus/error/button consumers.
3. Inspect auth, org shell/settings, issue/project lists, command palette, dialogs, charts and nested overlays in every retained theme. Validate custom generated pairs at the data boundary.
4. Verify keyboard, zoom, reduced motion, async states and D3 hit areas; run relevant lint/type tasks through Turbo using current scripts.

No application code has been changed by this proposal. The patch is the reviewable app-change artifact; the preview is its exact new token source.

## Reproduce documentation artifacts

From the repository root, `python3 docs/design-system/derive_tokens.py` regenerates the CSS preview, unapplied patch and contrast tables from current globals and the installed Tailwind theme. `python3 docs/design-system/inventory.py` regenerates lexical inventories; `python3 docs/design-system/group_colors.py` regenerates proximity groups. These tools write only documentation. Regeneration uses the resolved installed palette; review changes if dependency versions or source theme declarations have changed. Calculations are in `color_math.py`.
