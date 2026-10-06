# DS-05 Components and states

This document records **current runtime APIs** and a **proposed state contract** separately. Proposed state tokens do not create props, behavior or variants in today's implementation. Counts and every occurrence are in [component inventory](audit-component-counts.md). Contrast pairs are in [DS-01](01-color.md).

## Current APIs

| Component / source                                                     | Actual props beyond host props                                                                                                         | Existing defaults / tokens                                                                                                                       | Missing API or ownership                                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Button — `apps/web/components/ui/button.tsx:7-58`                      | Native button props; `variant`: default/destructive/outline/secondary/ghost/link; `size`: default/xxs/xs/sm/lg/icon; `asChild` boolean | default variant/size; 36px h-9; radius-md; text-sm/500; primary/primary-foreground; secondary pair; accent pair; input, ring, destructive        | No loading/error props or explicit pressed styling. Native disabled and aria-invalid only. `asChild` delegates semantics to child     |
| Input — `components/ui/input.tsx:5-24`                                 | Native input props, className/type                                                                                                     | 36px; radius-md; border-input; transparent host surface; foreground inherited; placeholder muted-foreground; ring/50; invalid destructive border | No label, message, busy or icon API                                                                                                   |
| Textarea — `components/ui/textarea.tsx:5-21`                           | Native textarea props                                                                                                                  | min-h-16/64px; padding px-3 py-2; same field tokens                                                                                              | No error-message/loading ownership                                                                                                    |
| Badge — `components/ui/badge.tsx:7-43`                                 | Span props; variant default/secondary/destructive/outline; asChild                                                                     | radius-md; text-xs/500; px-3 py-1; default primary pair                                                                                          | No success/warning/info variant, no loading/disabled behavior; focus/error classes are present but span is not inherently interactive |
| SidebarMenuButton — `components/ui/sidebar.tsx:451-523`                | Native button props; asChild; isActive; tooltip string or TooltipContent props; variant default/outline; size default/sm/lg            | default 32px, sm 28px, lg 48px; sidebar-accent pair; sidebar-ring; data-active/isActive                                                          | No loading/error API; route awareness belongs to SidebarNavLink                                                                       |
| SidebarNavLink — `components/layout/sidebar/sidebar-nav-link.tsx:9-28` | href, matchHrefs (defaults [href]), exact=false, children                                                                              | SidebarMenuButton asChild; active-path matcher; Link with aria-current=page                                                                      | Does not expose disabled/loading/error or arbitrary presentation props                                                                |
| Select — `components/ui/select.tsx:8-166`                              | Radix Root/Trigger/Content/Item props; trigger className/children                                                                      | 36px trigger; border-input; foreground/placeholder muted; popover pair for content; selected check                                               | No standalone error-message/loading API                                                                                               |
| Dialog — `components/ui/dialog.tsx:8-125`                              | Radix props; DialogContent showCloseButton=true                                                                                        | background/foreground, border, ring; z-50; black/50 overlay; radius-lg; shadow-lg                                                                | Feature owns async submit/error; close target needs sizing policy                                                                     |
| Toaster — `components/ui/sonner.tsx:6-31`                              | Sonner ToasterProps; spread props can override defaults                                                                                | theme from next-themes; background/foreground/border; muted description; primary action; shadow-lg                                               | Duration/severity persistence not enforced                                                                                            |

The separate `registry/components/button` supports a different loading/size API. Do not document it as the API of `@/components/ui/button`. No app import of its global foundation stylesheet was found.

## State legend

**Present** = explicit style/behavior in the wrapper source; **native/Radix** = mechanism delegated to the underlying control; **feature-owned** = must be supplied by caller; **N/A** = static component should not acquire a fake interaction. Runtime behavior is not browser verified.

| Component           | Default             | Hover                     | Focus                                 | Active/pressed                                    | Disabled                       | Loading                   | Error                                               |
| ------------------- | ------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------- | ------------------------------ | ------------------------- | --------------------------------------------------- |
| Button              | Present             | Present per variant       | Present ring/50                       | No explicit pressed style                         | Native + opacity-50            | Feature-owned, no prop    | aria-invalid border/ring; explanation feature-owned |
| Input/Textarea      | Present             | No explicit hover         | Present ring/50                       | Native caret/selection; no fill change            | Native + opacity-50            | Feature-owned             | aria-invalid border/ring; message feature-owned     |
| Select              | Present             | No explicit trigger hover | Present; items keyboard focus         | Radix open/selected                               | Native/Radix + styles          | Feature-owned             | aria-invalid trigger; message feature-owned         |
| Static Badge        | Present             | Link child selector only  | Present class, normally not focusable | N/A                                               | No native disabled             | Feature-owned status text | aria-invalid class, normally not field validation   |
| SidebarMenuButton   | Present             | Present                   | Present                               | data-active persistent page + active pseudo style | disabled/aria-disabled classes | Feature-owned             | Feature-owned                                       |
| Card/SettingsCard   | Present             | N/A unless clickable row  | Row-dependent                         | Row-dependent                                     | Feature-owned                  | Content-owned             | Content-owned                                       |
| Table               | Present             | Row hover                 | Actions feature-owned                 | data-state=selected                               | Feature-owned                  | Feature-owned             | Feature-owned                                       |
| Dialog/Popover/Menu | Present open/closed | Trigger/items             | Radix/wrapper                         | Open/selected                                     | Trigger/items                  | Content-owned             | Content-owned                                       |
| Toast/Alert         | Present             | Action/dismiss controls   | Action/dismiss controls               | Action controls                                   | Action controls                | Feature-owned             | Severity/message feature-owned                      |
| Empty state         | Feature-owned       | CTA only                  | CTA only                              | CTA only                                          | CTA only                       | Separate loading branch   | Separate error branch                               |

## Buttons: proposed variant/state table

Map public “primary” to existing `variant="default"`; do not pass `variant="primary"` because it is not accepted. Public secondary maps to secondary; retain outline for bordered alternatives. Public destructive maps to destructive. The base radius is md, control type is 14px/500/20px and icon gap is space-2. Geometry retains the existing 36px default and 32px compact rows under D3; use 44px touch hit areas.

| State               | Primary (approved blue)                                                                              | Secondary                        | Ghost                                     | Destructive                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Default             | primary blue-700 + primary-foreground gray-50; replaces current near-white                           | secondary + secondary-foreground | Transparent + foreground on approved host | destructive + destructive-foreground                            |
| Hover               | action-hover + primary-foreground                                                                    | accent + foreground              | accent + foreground                       | destructive-hover + destructive-foreground                      |
| Focus               | Same label/fill; opaque ring, 2px perimeter and 2px offset                                           | Same ring                        | Same ring                                 | Same ring; no red-opacity focus substitute                      |
| Active/pressed      | action-active + primary-foreground                                                                   | surface-raised + foreground      | surface-raised + foreground               | destructive-active + destructive-foreground                     |
| Disabled            | muted + text-disabled, native disabled                                                               | Same                             | Transparent + text-disabled               | muted + text-disabled; do not suggest danger remains actionable |
| Loading             | Default pair; keep label; spinner color matches label; aria-busy; prevent duplicate activation       | Same                             | Same                                      | Same                                                            |
| Error after failure | Retain default action and expose separate error + retry; do not use aria-invalid as sole explanation | Same                             | Same                                      | Preserve confirmation context and error; no auto-close          |

Use `--action-hover/active` with the D2 mapping. The preview maps primary/foreground and action-hover/active to the approved blue state palette in every fixed theme. Current `/90` and `/80` hover classes must be replaced to implement this table. Disabled opacity-50 must be removed when using explicit disabled roles; no compounded opacity. `aria-disabled` alone does not stop clicks; use native disabled when semantics permit, or block every activation path explicitly.

`asChild` example for a destination uses Button with Link and a visible destination label. For icon-only links, place aria-label on Link. Loading is a composition requirement, not an invented `loading` prop. Do not show a spinner by removing the accessible label.

## Text Fields: proposed states

| State          | Tokens and behavior                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Default        | Host background/container; inherited foreground; input boundary; muted-foreground placeholder; radius-md; 36px default height  |
| Hover          | Same fill/label; input boundary remains visible; no new hover fill needed                                                      |
| Focus          | Full-opacity ring 2px, 2px offset; input border; normal label/value pair                                                       |
| Active/editing | Same as focus; native caret; selection uses approved primary pair                                                              |
| Disabled       | muted fill + text-disabled, native disabled; preserve displayed value, do not erase it                                         |
| Loading        | Preserve value and label; aria-busy on field group; disable only when changing value is unsafe                                 |
| Error          | aria-invalid=true; error border; error text with id referenced by aria-describedby; focus first invalid field on failed submit |

Label/control gap space-1, helper/error gap space-1, field gap space-4. Error text is error on an approved neutral surface. Focus ring remains visible alongside the error border. Label must remain present after entry. Textarea gets the same states and 64px minimum height; use grow/scroll rather than clipping long content. `readOnly` is separate from disabled and remains selectable/focusable with normal text contrast.

## Badges/status: proposed states

| State    | Static status                                                                                          | Interactive status picker/link                                      |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Default  | status-surface; success/warning/error/info text + labeled icon, or neutral foreground for domain label | Same status plus button/link/combobox semantics                     |
| Hover    | N/A                                                                                                    | accent fill; retain semantic readable status label                  |
| Focus    | N/A                                                                                                    | Full-opacity ring, 2px perimeter and offset                         |
| Active   | N/A; selected data is not a pressed state                                                              | surface-raised fill; selected check/label remains                   |
| Disabled | Display last known status with normal contrast; do not fade static facts                               | text-disabled on muted only when action is unavailable; explain why |
| Loading  | “Updating…” in a busy status region; preserve last confirmed label where useful                        | Prevent duplicate change; preserve name; spinner plus text          |
| Error    | Preserve known status; separate error text and recovery                                                | Same; do not falsely label data “Error” when only update failed     |

Current Badge has only default/secondary/destructive/outline. Proposed semantic status rendering requires a narrow wrapper or explicit future CVA additions; `variant="success"` is not currently a valid prop. Status dots and labels use the same established meaning across issue/project/initiative lists and their charts. Unknown status uses label “Unknown” and neutral foreground, not green or empty text.

## Navigation items: proposed states

| State                | Rule                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default              | sidebar-foreground on sidebar; normal item icon/label; `href` retained                                                                                        |
| Hover                | sidebar-accent + sidebar-accent-foreground                                                                                                                    |
| Focus                | sidebar-ring opaque 2px perimeter and 2px offset; independent of active page                                                                                  |
| Active page          | sidebar-accent + sidebar-accent-foreground, medium text and aria-current=page; do not rely on fill alone                                                      |
| Pointer pressed      | surface-raised + foreground; do not change aria-current until route changes                                                                                   |
| Disabled/unavailable | Do not create a broken href. Omit forbidden destinations; if discoverability matters, render a named unavailable item with aria-disabled and block activation |
| Loading              | Link stays usable when a count loads; Skeleton replaces only count; busy region reports progress                                                              |
| Error                | Error indicator with accessible name plus retry for failed count/query; destination remains usable when safe                                                  |

Use SidebarNavLink's `matchHrefs` and `exact` rather than editing the current path matcher ad hoc. Header navigation must adopt equivalent link/active/focus semantics; a header tab implementing a real tablist uses Radix Tabs instead. Sidebar count badges use Caption and tabular numerals. Expanded/collapsed item names must be identical. Rail resizing/toggling must have an equivalent keyboard control.

## Verification required in migration

For each changed primitive capture all applicable states in the reference dark theme and every retained theme. Use Tab/Shift+Tab, Enter/Space, Escape and arrow keys where appropriate; verify focus restoration, no clipped focus at scroll boundaries, and 200% zoom/reflow. Include touch target evidence for D3. Contrast uses the actual composite color when opacity/background images remain. State coverage is a feature requirement; merely having `disabled` or `aria-invalid` in the type signature is not evidence that a screen handles the state.
