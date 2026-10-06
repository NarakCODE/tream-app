# DS-04 Component usage

Status: proposed behavioral contract grounded in the runtime primitives. [DS-05](05-components.md) distinguishes actual props/states from missing behavior. Import runtime controls from `@/components/ui/*`; do not adopt registry counterparts implicitly.

## Buttons

Anatomy: hit target, optional leading icon, visible label, optional trailing icon/spinner. Use Button for actions; use `asChild` + Next Link for navigation. Primary = one highest-priority commit action per form/dialog; secondary/outline = alternative action; ghost = repeated toolbar/row action; destructive = irreversible operation with confirmation or undo. Do not render clickable divs or turn all row actions into filled buttons.

Use control typography, radius-md, gap-2 and the selected D3 target policy. Preserve native `type`, `disabled`, accessible name and keyboard activation through `asChild`. Set `type="button"` on non-submit form buttons. Loading retains the label, adds a spinner, sets `aria-busy`, and prevents duplicate submission. Errors keep the action available for retry and show associated error text. Icon-only actions require an explicit aria-label and decorative `aria-hidden` icon; a tooltip does not replace the name.

## Text fields and textarea

Anatomy: visible label, optional required marker, input/textarea, optional helper, inline error. Use Input for a single line and Textarea for multiline content. Do not use a placeholder as the label; do not turn a text field into a select if users can enter arbitrary values.

Use regular input padding space-3; label/helper gaps space-1 and between fields space-4. Keep entered values after errors. Use native type, name, autocomplete and inputMode. Use FormControl/FormLabel/FormMessage or equivalent explicit ids and `aria-describedby`. Validate on submit; focus the first invalid field. `aria-invalid=true` supplies styling but does not itself explain the failure. Show inline error text in error, not the destructive fill's foreground token. Do not block paste. For loading, disable only controls that cannot safely change while saving, mark the owning region busy and preserve label/value.

## Selects and command pickers

Anatomy: labeled trigger/value, disclosure icon, portaled list, selected indicator, optional groups/search and empty result. Use Select for a short, finite set; use existing Popover+Command pattern for searchable assignees/statuses/projects. Do not use a custom div dropdown or an unsearchable huge menu.

Keep Radix keyboard behavior: arrow keys navigate, Enter selects, Escape closes, focus returns to trigger. Selected values have check/text cues in addition to color. Use disabled items only when a persistent reason is available. A failed option load is an error with retry, not “No results”. Loading is a picker-owned state, not a prop supplied by the current Select wrapper. Use trigger input/ring tokens, radius-md and elevation-2; apply layer-popover in the migration.

## Badges and status

Anatomy: status label plus optional icon/dot; optional interaction is a separate link/picker. Use a static badge for status/classification, not a button-shaped call to action. Success/warning/error/info have text plus icon; retain user-defined label dots as data exceptions with semantic text. Do not map every “Done” lavender dot to brand blue without verifying domain meaning.

Use Caption/Label size, radius-sm or existing intentional pill, and space-1 icon gap. Static badges have no focus/hover/loading state. A loading status is visible text “Updating…” with busy region; a failed update preserves the last confirmed status and shows retry/error separately. Interactive badges use link/button semantics and the shared focus and target rules. Never signal disabled, selected or error with color alone.

## Navigation and sidebar

Anatomy: navigation landmark, grouped links, icon, label, optional count, active-page cue; group actions are separate buttons. Use SidebarNavLink for destinations and Button for actions such as creating an issue. Do not use an onClick button as a destination link or duplicate shell page headings in the content area.

Set `aria-current="page"` for the active link and `aria-expanded` for disclosure groups. Retain a visible focus ring and icon/name when collapsed; tooltip is supplementary. Use the existing active path matcher instead of ad-hoc string includes. Sidebar menu default is 32px and collapse breakpoint lg; D3 requires 44px touch hit areas; use correct target hit areas for 20px action glyphs. Distinguish pressed pointer state from active-page state. Load counts with a skeleton/status announcement, not disabled navigation. Error badges have a name and remain separate from the destination label.

## Cards and settings groups

Anatomy: container, optional heading/description, content, optional footer. Prefer existing SettingsCard/SettingsRow for settings. Card primitive is currently unused by direct imports; it does not establish a new visual default. Use cards to group related controls or an independently actionable item, not to wrap every line.

Use surface/container roles, radius-lg, decorative border and elevation-0 for static settings. Keep settings row `px-4 py-3`. Clickable SettingsRow uses a native button and requires focus; do not nest other buttons/links inside it. Card titles use heading semantics at the correct level, not the CardTitle div alone. Loading belongs to content skeletons; error belongs to a labeled inline region, preserving stable layout.

## Tables and lists

Anatomy: optional toolbar, header labels, rows/cells, selection/actions, empty/loading/error region, pagination. Use semantic Table for tabular data and the existing feature list/board for issue workflows. Do not replace domain rows with a generic Table merely for styling.

Sorting headers are buttons with `aria-sort` on the associated header; row actions are named, keyboard reachable buttons. Selection is a checkbox with a row-specific label and visible check, not background color alone. Use metadata/Body roles, tabular numerals for numeric columns, and fixed semantic status indicators. Row hover uses accent; selected uses accent plus explicit selection cue. Do not put unreadable text under whole-row opacity. Loading skeletons retain column geometry and mark the region busy; empty/search-empty/error are distinct. Horizontal scroll is permitted for a genuine data table, not the whole page. `ui/table.tsx` currently only supplies visual structure, hover and selected styling; data/query ownership stays in the feature.

## Dialogs, alert dialogs and sheets

Anatomy: overlay, dialog content, title, optional description, close button, body, footer actions. Use Dialog for a focused task; AlertDialog for destructive confirmation requiring a decision; Sheet for the existing narrow-screen sidebar or contextual task. Do not use a modal for an inline status message.

Use named title/description helpers, padding space-6, group gap space-4, radius-lg, elevation-3. Escape closes non-destructive dialogs; cancellation preserves previously saved data. Move focus inside, trap it, make background noninteractive, and restore focus to the opener; preserve Radix behavior and check custom composition. Long content scrolls inside the dialog without hiding footer actions; prevent background scroll. Close icons require a named target meeting D3 (the current X wrapper is approximately 16px and needs expansion). Reduced motion removes scale/slide transitions. Loading keeps title/description and action labels visible; error is inline and announced. Do not close on a failed mutation.

## Popovers, menus and tooltips

Use Popover for contextual interactive content, DropdownMenu/ContextMenu for actions, Tooltip for supplementary short information. Tooltips do not contain required instructions or interactive actions. All interactive triggers have a name and visible focus. Menus retain Radix roving keyboard navigation, Escape and focus return. Use popover/foreground tokens, radius-md, elevation-2 and the proposed layer token; do not use hardcoded z-index to escape a broken stacking context. Loading/error belongs to content or query state, not the primitive wrapper. Disabled items explain why persistently if the tooltip cannot receive focus.

## Toasts and alerts

Anatomy: status icon, short result label, optional description, optional action/dismiss. The root layout mounts one Sonner Toaster. Use toast for confirmation that does not require continuing the workflow; use inline field/region error for recoverable form errors. Do not show a toast as the only evidence of a failed save.

Routine updates use polite status announcements; urgent non-field errors may use alert. Keep error/action toasts visible until dismissed; no automatic dismissal of the only recovery action. Keep accessible dismiss/action names and keyboard reachability. Sonner props control duration/action behavior; current wrapper does not enforce persistence by severity. Use background/foreground/border and elevation-3; selected theme must resolve through semantic tokens. `Alert` always sets role=alert today; use a non-alert status region for informational notices during migration.

## Empty, loading and error states

Existing feature-level states appear in `features/issues/issue-list.tsx`, `my-issues-list.tsx`, `components/common/reviews/reviews.tsx` and inbox. There is no universal EmptyState primitive. Reuse these patterns without inventing a new illustration style.

Empty = title + one sentence + permitted next action. Search empty = scope/filter explanation + clear filters. Loading = geometry-preserving Skeleton + stable busy/status region, never fake empty data. Error = plain-language explanation + retry if meaningful + retained prior data when safe. No permissions = explanation without unavailable CTA. Each query-backed feature must document these four branches and their labels. Decorative empty artwork is aria-hidden; status/title is not. Do not announce every skeleton item separately.

## Other installed primitives

Checkbox/switch/toggle/slider: use native/Radix label associations, explicit checked/pressed/value state, semantic primary/control colors and the shared focus policy. Expand the target around the 16px checkbox and 20px switch track rather than confusing glyph size with hit area. Tabs follow tablist/tab/tabpanel keyboard semantics; breadcrumb is labeled navigation with current-page semantics. Avatar image/fallback needs a meaningful name only when it conveys identity; purely decorative copies are hidden. Progress requires an accessible name and determinate value or announced indeterminate state. Resizable handles need a keyboard path and separator semantics; do not remove their focus indication. These wrappers must undergo the same retained-theme and target checks as the core controls.
