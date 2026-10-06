# DS-01 Color

Status: proposed dark reference. D1/D2/D3 are resolved: retain all themes, blue primary actions, compact desktop targets and 44px touch targets. No application CSS has changed.

## Provenance and primitive palette

Keep the current cool zinc grays: do not substitute a new slate palette just because the product direction says “slate”. Use the blue family already supplied by the installed Tailwind v4 theme and used as blue utilities/sidebar tokens. Primitive colors may appear only in the token source; components use semantic roles. The product owner approved blue primary buttons; this deliberately changes the existing near-white action role.

| Token        | CSS value                    | sRGB approximation | Source / role                                                                                |
| ------------ | ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `--gray-50`  | `oklch(98.5% 0 none)`        | `#fafafa`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-100` | `oklch(96.7% 0.001 286.375)` | `#f4f4f5`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-200` | `oklch(92% 0.004 286.32)`    | `#e4e4e7`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-300` | `oklch(87.1% 0.006 286.286)` | `#d4d4d8`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-400` | `oklch(70.5% 0.015 286.067)` | `#9f9fa9`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-500` | `oklch(55.2% 0.016 285.938)` | `#71717b`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-600` | `oklch(44.2% 0.017 285.786)` | `#52525c`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-700` | `oklch(37% 0.013 285.805)`   | `#3f3f46`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-800` | `oklch(27.4% 0.006 286.033)` | `#27272a`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-900` | `oklch(21% 0.006 285.885)`   | `#18181b`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--gray-950` | `oklch(14.1% 0.005 285.823)` | `#09090b`          | Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors |
| `--blue-100` | `oklch(93.2% 0.032 255.585)` | `#dbeafe`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-200` | `oklch(88.2% 0.059 254.128)` | `#bedbff`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-300` | `oklch(80.9% 0.105 251.813)` | `#8ec5ff`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-400` | `oklch(70.7% 0.165 254.624)` | `#51a2ff`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-500` | `oklch(62.3% 0.214 259.815)` | `#2b7fff`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-600` | `oklch(54.6% 0.245 262.881)` | `#155dfc`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-700` | `oklch(48.8% 0.243 264.376)` | `#1447e6`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-800` | `oklch(42.4% 0.199 265.638)` | `#193cb8`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--blue-900` | `oklch(37.9% 0.146 265.522)` | `#1c398e`          | Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1                      |
| `--red-400`  | `oklch(70.4% 0.191 22.216)`  | `#ff6467`          | Existing destructive family; expanded named states                                           |
| `--red-700`  | `oklch(50.5% 0.213 27.518)`  | `#c10007`          | Existing destructive family; expanded named states                                           |
| `--red-800`  | `oklch(44.4% 0.177 26.899)`  | `#9f0712`          | Existing destructive family; expanded named states                                           |
| `--red-900`  | `oklch(39.6% 0.141 25.723)`  | `#82181a`          | Existing destructive family; expanded named states                                           |
| `--red-950`  | `oklch(25.8% 0.092 26.042)`  | `#460809`          | Existing destructive family; expanded named states                                           |

Gray 50/950 extend the requested 100–900 scale because current foreground/background use those endpoints. Removing them would change the existing look. `--container=#101011` remains a semantic surface exception because it is already the inset authenticated shell color. Blue 100–900 are inherited palette values, not generated interpolation. Only the observed anchors are claimed as existing runtime use.

## Semantic roles

| Token / utility                                                    | Reference dark value                      | Example usage                                                            |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| `--background` / `bg-background`                                   | `gray-950` → `oklch(14.1% 0.005 285.823)` | Page canvas                                                              |
| `--container` / `bg-container`                                     | `#101011` → `#101011`                     | Existing inset main surface                                              |
| `--card` / `bg-card`                                               | `gray-950` → `oklch(14.1% 0.005 285.823)` | Existing Card surface                                                    |
| `--popover` / `bg-popover`                                         | `gray-950` → `oklch(14.1% 0.005 285.823)` | Existing overlay content                                                 |
| `--sidebar` / `bg-sidebar`                                         | `gray-900` → `oklch(21% 0.006 285.885)`   | Existing sidebar surface                                                 |
| `--surface-raised` / `bg-surface-raised`                           | `gray-900` → `oklch(21% 0.006 285.885)`   | Raised groups                                                            |
| `--foreground` / `text-foreground`                                 | `gray-50` → `oklch(98.5% 0 none)`         | Body and headings                                                        |
| `--card-foreground` / `text-card-foreground`                       | `gray-50` → `oklch(98.5% 0 none)`         | Card text                                                                |
| `--popover-foreground` / `text-popover-foreground`                 | `gray-50` → `oklch(98.5% 0 none)`         | Popover text                                                             |
| `--sidebar-foreground` / `text-sidebar-foreground`                 | `gray-50` → `oklch(98.5% 0 none)`         | Sidebar text                                                             |
| `--muted` / `bg-muted`                                             | `gray-800` → `oklch(27.4% 0.006 286.033)` | Muted and disabled surfaces                                              |
| `--muted-foreground` / `text-muted-foreground`                     | `gray-400` → `oklch(70.5% 0.015 286.067)` | Secondary/helper text                                                    |
| `--text-disabled` / `text-text-disabled`                           | `gray-500` → `oklch(55.2% 0.016 285.938)` | Unavailable controls only                                                |
| `--primary` / `bg-primary`                                         | `blue-700` → `oklch(48.8% 0.243 264.376)` | Approved blue primary button                                             |
| `--primary-foreground` / `text-primary-foreground`                 | `gray-50` → `oklch(98.5% 0 none)`         | Approved light primary label                                             |
| `--secondary` / `bg-secondary`                                     | `gray-800` → `oklch(27.4% 0.006 286.033)` | Secondary button fill                                                    |
| `--secondary-foreground` / `text-secondary-foreground`             | `gray-50` → `oklch(98.5% 0 none)`         | Secondary label                                                          |
| `--accent` / `bg-accent`                                           | `gray-800` → `oklch(27.4% 0.006 286.033)` | Hover and selected neutral surface; not brand blue                       |
| `--accent-foreground` / `text-accent-foreground`                   | `gray-50` → `oklch(98.5% 0 none)`         | Hover/selected text                                                      |
| `--border` / `border-border`                                       | `gray-800` → `oklch(27.4% 0.006 286.033)` | Decorative separators                                                    |
| `--input` / `border-input`                                         | `gray-500` → `oklch(55.2% 0.016 285.938)` | Proposed visible control boundary                                        |
| `--ring` / `ring-ring`                                             | `blue-400` → `oklch(70.7% 0.165 254.624)` | Proposed opaque keyboard focus; requires class migration                 |
| `--brand` / `bg-brand`                                             | `blue-500` → `oklch(62.3% 0.214 259.815)` | Primary brand mark, not small text on filled blue                        |
| `--brand-text` / `text-brand-text`                                 | `blue-400` → `oklch(70.7% 0.165 254.624)` | Links on neutral dark surfaces                                           |
| `--brand-action` / `bg-brand-action`                               | `blue-700` → `oklch(48.8% 0.243 264.376)` | Approved blue action                                                     |
| `--brand-action-hover` / `bg-brand-action-hover`                   | `blue-600` → `oklch(54.6% 0.245 262.881)` | Approved blue hover                                                      |
| `--brand-action-active` / `bg-brand-action-active`                 | `blue-800` → `oklch(42.4% 0.199 265.638)` | Approved blue press                                                      |
| `--brand-action-foreground` / `text-brand-action-foreground`       | `gray-50` → `oklch(98.5% 0 none)`         | Label on blue action                                                     |
| `--action-hover` / `bg-action-hover`                               | `blue-600` → `oklch(54.6% 0.245 262.881)` | Approved primary hover                                                   |
| `--action-active` / `bg-action-active`                             | `blue-800` → `oklch(42.4% 0.199 265.638)` | Approved primary pressed                                                 |
| `--destructive` / `bg-destructive`                                 | `red-900` → `oklch(39.6% 0.141 25.723)`   | Existing destructive fill                                                |
| `--destructive-foreground` / `text-destructive-foreground`         | `gray-50` → `oklch(98.5% 0 none)`         | Fix error foreground mismatch for filled action                          |
| `--destructive-hover` / `bg-destructive-hover`                     | `red-800` → `oklch(44.4% 0.177 26.899)`   | Proposed explicit hover replaces opacity                                 |
| `--destructive-active` / `bg-destructive-active`                   | `red-950` → `oklch(25.8% 0.092 26.042)`   | Proposed explicit press                                                  |
| `--success` / `text-success`                                       | `#4cb782` → `#4cb782`                     | Existing status green                                                    |
| `--warning` / `text-warning`                                       | `#f2c94c` → `#f2c94c`                     | Existing status yellow                                                   |
| `--error` / `text-error`                                           | `red-400` → `oklch(70.4% 0.191 22.216)`   | Readable error text; replaces inconsistent red-500/foreground fill usage |
| `--info` / `text-info`                                             | `blue-400` → `oklch(70.7% 0.165 254.624)` | Information text/icon                                                    |
| `--status-surface` / `bg-status-surface`                           | `gray-800` → `oklch(27.4% 0.006 286.033)` | Default status badge fill                                                |
| `--sidebar-primary` / `bg-sidebar-primary`                         | `blue-700` → `oklch(48.8% 0.243 264.376)` | Existing dark sidebar brand                                              |
| `--sidebar-primary-foreground` / `text-sidebar-primary-foreground` | `gray-50` → `oklch(98.5% 0 none)`         | Sidebar blue label                                                       |
| `--sidebar-accent` / `bg-sidebar-accent`                           | `gray-800` → `oklch(27.4% 0.006 286.033)` | Sidebar hover/active                                                     |
| `--sidebar-accent-foreground` / `text-sidebar-accent-foreground`   | `gray-50` → `oklch(98.5% 0 none)`         | Sidebar hovered text                                                     |
| `--sidebar-border` / `border-sidebar-border`                       | `gray-800` → `oklch(27.4% 0.006 286.033)` | Sidebar separator                                                        |
| `--sidebar-ring` / `ring-sidebar-ring`                             | `blue-400` → `oklch(70.7% 0.165 254.624)` | Sidebar keyboard focus                                                   |

`--border` is a decorative separator. Required input boundaries use `--input` and cannot rely on the low-contrast decorative border alone. Focus uses `--ring` at full opacity with a 2px perimeter and 2px offset; existing `ring-ring/50` classes still need migration. Transparent ghost controls inherit their containing surface and use the neutral accent surface for hover/press. Selection uses accent plus foreground and a text/check indicator, not blue alone.

## Permitted text/background combinations and contrast

Computed using WCAG relative luminance from sRGB, converting OKLCH to sRGB and clipping out-of-gamut channels. Ratios use unrounded values for pass/fail; tables round display to two decimals. Hex approximations are informational; CSS values above are the source. This is token-pair calculation, not a claim of browser measurement. Card/popover reuse background, sidebar reuses surface-raised, secondary/muted/sidebar-accent reuse accent. The table therefore covers those aliases too. No other text/background pairing is approved without a new calculation.

| Text token           |      Container #101011 | Background/card/popover |         Raised/sidebar | Accent/secondary/muted |         Status surface |
| -------------------- | ---------------------: | ----------------------: | ---------------------: | ---------------------: | ---------------------: |
| `--foreground`       |                18.21:1 |                 19.05:1 |                16.98:1 |                14.26:1 |                14.26:1 |
| `--muted-foreground` |                 7.23:1 |                  7.56:1 |                 6.74:1 |                 5.66:1 |                 5.66:1 |
| `--text-disabled`    | 3.94:1 (inactive only) |  4.12:1 (inactive only) | 3.67:1 (inactive only) | 3.08:1 (inactive only) | 3.08:1 (inactive only) |
| `--brand-text`       |                 7.21:1 |                  7.54:1 |                 6.72:1 |                 5.65:1 |                 5.65:1 |
| `--success`          |                 7.61:1 |                  7.96:1 |                 7.09:1 |                 5.96:1 |                 5.96:1 |
| `--warning`          |                11.99:1 |                 12.54:1 |                11.17:1 |                 9.39:1 |                 9.39:1 |
| `--error`            |                 6.58:1 |                  6.88:1 |                 6.13:1 |                 5.15:1 |                 5.15:1 |
| `--info`             |                 7.21:1 |                  7.54:1 |                 6.72:1 |                 5.65:1 |                 5.65:1 |

| Label token                 | Fill token / state      | Contrast | Use                                                      |
| --------------------------- | ----------------------- | -------: | -------------------------------------------------------- |
| `--primary-foreground`      | `--primary`             |   6.54:1 | Approved primary default                                 |
| `--primary-foreground`      | `--action-hover`        |   5.03:1 | Approved blue hover                                      |
| `--primary-foreground`      | `--action-active`       |   8.47:1 | Approved blue pressed                                    |
| `--brand-action-foreground` | `--brand-action`        |   6.54:1 | Approved blue default                                    |
| `--brand-action-foreground` | `--brand-action-hover`  |   5.03:1 | Approved blue hover                                      |
| `--brand-action-foreground` | `--brand-action-active` |   8.47:1 | Approved blue press                                      |
| `--destructive-foreground`  | `--destructive`         |   9.63:1 | Destructive default                                      |
| `--destructive-foreground`  | `--destructive-hover`   |   8.02:1 | Destructive hover                                        |
| `--destructive-foreground`  | `--destructive-active`  |  15.46:1 | Destructive pressed                                      |
| `--text-disabled`           | `--muted`               |   3.08:1 | Disabled, contrast exemption; do not use for helper text |

Disabled controls use text-disabled on muted without an additional opacity multiplier. Loading uses the enabled label/fill pair and a spinner with the same text color. Ghost/secondary focus does not change the label pair. Error fields use error text on their host neutral surface; do not place error text over destructive fill. Static badges have no hover/focus/active state; interactive status pickers inherit Button/Select state rules.

## Non-text contrast and current failures

| Pair                        | Calculated contrast | Decision                                           |
| --------------------------- | ------------------: | -------------------------------------------------- |
| `--ring` / `--background`   |              7.54:1 | Use for focus/boundary at full opacity             |
| `--ring` / `--accent`       |              5.65:1 | Use for focus/boundary at full opacity             |
| `--input` / `--background`  |              4.12:1 | Use for focus/boundary at full opacity             |
| `--input` / `--accent`      |              3.08:1 | Use for focus/boundary at full opacity             |
| `--border` / `--background` |              1.34:1 | Decorative only; not a required component boundary |

Current default `.dark --ring` against background is 2.57:1; at existing 50% ring opacity, its sRGB-composited approximation is 1.46:1. This motivates the focus remediation; actual adjacent colors must still be checked in a browser.
Current default `--destructive-foreground` (red-500) on `--destructive` (red-900) is 2.63:1. Button/Badge currently override the foreground with text-white, so this is a token-contract failure, not a claim that all destructive buttons fail. The proposal pairs light foreground with the filled action and a separate readable error token for inline validation.

## Theme and color-data limits

D1 retains all themes. Existing preset surface/foreground declarations are extracted unchanged, then explicit semantic overrides map primary buttons to the approved blue family and complete new roles for each fixed theme. The additional matrices below calculate those preset pairs. Custom themes can generate arbitrary surface/accent values through `theme-applier.tsx`; no finite matrix certifies them. Replace the current brightness heuristic with pair validation and offer a reset to the reference theme. Custom generation must not overwrite the approved blue action mapping; keep editable surface/sidebar accent preferences and validate readable text/indicators.

Keep external integration logos, user-owned label colors and chart-series identities out of blind brand-color replacement. Decorative/user color can remain data behind a reviewed color API; label text and required icons still use validated semantic roles. Domain colors (`#6771c5`, `#5e6ad2`, `#95a2b3`, etc.) should become separately named domain tokens after their meaning is established, not all become primary blue.

## Acceptance rules

- Normal text and placeholders require at least 4.5:1; large text at least 3:1. Inactive controls are exempt, but metadata is not disabled text. See [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Required control boundaries and focus indicators require at least 3:1 against adjacent colors under this system. See [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- Set status with label plus icon/shape. Color alone cannot distinguish success/warning/error/info.
- No arbitrary color, literal hex/RGB/HSL/OKLCH or palette utility in new component styles. Use semantic roles; add reviewed exceptions to the token/data API.
- Do not reduce foreground opacity to create secondary text; use muted-foreground. Do not apply opacity to a whole badge/control except during the legacy migration.

## Light proposed pair matrix

The preset background/surface colors remain existing values; primary/focus/status semantic mappings are proposed overrides. Disabled-only pairs are measured but exempt. Card/popover/sidebar/secondary aliases use their actual preset surface below.

| Text role            |             Background |         Container/card |                Popover |                Sidebar | Accent/status/secondary |
| -------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ----------------------: |
| `--foreground`       |                18.50:1 |                19.89:1 |                19.89:1 |                18.50:1 |                 18.07:1 |
| `--muted-foreground` |                 7.19:1 |                 7.73:1 |                 7.73:1 |                 7.19:1 |                  7.02:1 |
| `--text-disabled`    | 4.49:1 (inactive only) | 4.83:1 (inactive only) | 4.83:1 (inactive only) | 4.49:1 (inactive only) |  4.39:1 (inactive only) |
| `--brand-text`       |                 6.35:1 |                 6.82:1 |                 6.82:1 |                 6.35:1 |                  6.20:1 |
| `--success`          |                 4.86:1 |                 5.22:1 |                 5.22:1 |                 4.86:1 |                  4.75:1 |
| `--warning`          |                 4.65:1 |                 5.00:1 |                 5.00:1 |                 4.65:1 |                  4.55:1 |
| `--error`            |                 5.97:1 |                 6.42:1 |                 6.42:1 |                 5.97:1 |                  5.83:1 |
| `--info`             |                 6.35:1 |                 6.82:1 |                 6.82:1 |                 6.35:1 |                  6.20:1 |

| Pair                                                | Contrast | Requirement |
| --------------------------------------------------- | -------: | ----------- |
| `--primary-foreground` / `--primary`                |   6.54:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-hover`           |   5.03:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-active`          |   8.47:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive`        |   9.63:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-hover`  |   8.02:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-active` |  15.46:1 | 4.5:1 pass  |
| `--ring` / `--background`                           |   6.35:1 | 3:1 pass    |
| `--ring` / `--accent`                               |   6.20:1 | 3:1 pass    |
| `--input` / `--background`                          |   4.49:1 | 3:1 pass    |
| `--input` / `--accent`                              |   4.39:1 | 3:1 pass    |

Host values: `--background=oklch(0.975 0.001 286.375)`, `--container=#fff`, `--popover=oklch(1 0 0)`, `--sidebar=oklch(0.975 0.001 286.375)`, `--accent=oklch(0.967 0.001 286.375)`, `--foreground=oklch(0.141 0.005 285.823)`, `--muted-foreground=oklch(44.2% 0.017 285.786)`, `--brand-text=oklch(48.8% 0.243 264.376)`, `--success=#087c54`, `--warning=#9c6300`, `--error=oklch(50.5% 0.213 27.518)`.

## Pure Light proposed pair matrix

The preset background/surface colors remain existing values; primary/focus/status semantic mappings are proposed overrides. Disabled-only pairs are measured but exempt. Card/popover/sidebar/secondary aliases use their actual preset surface below.

| Text role            |             Background |         Container/card |                Popover |                Sidebar | Accent/status/secondary |
| -------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ----------------------: |
| `--foreground`       |                19.89:1 |                19.89:1 |                19.89:1 |                19.89:1 |                 18.10:1 |
| `--muted-foreground` |                 7.73:1 |                 7.73:1 |                 7.73:1 |                 7.73:1 |                  7.03:1 |
| `--text-disabled`    | 4.83:1 (inactive only) | 4.83:1 (inactive only) | 4.83:1 (inactive only) | 4.83:1 (inactive only) |  4.39:1 (inactive only) |
| `--brand-text`       |                 6.82:1 |                 6.82:1 |                 6.82:1 |                 6.82:1 |                  6.21:1 |
| `--success`          |                 5.22:1 |                 5.22:1 |                 5.22:1 |                 5.22:1 |                  4.75:1 |
| `--warning`          |                 5.00:1 |                 5.00:1 |                 5.00:1 |                 5.00:1 |                  4.55:1 |
| `--error`            |                 6.42:1 |                 6.42:1 |                 6.42:1 |                 6.42:1 |                  5.84:1 |
| `--info`             |                 6.82:1 |                 6.82:1 |                 6.82:1 |                 6.82:1 |                  6.21:1 |

| Pair                                                | Contrast | Requirement |
| --------------------------------------------------- | -------: | ----------- |
| `--primary-foreground` / `--primary`                |   6.54:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-hover`           |   5.03:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-active`          |   8.47:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive`        |   9.63:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-hover`  |   8.02:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-active` |  15.46:1 | 4.5:1 pass  |
| `--ring` / `--background`                           |   6.82:1 | 3:1 pass    |
| `--ring` / `--accent`                               |   6.21:1 | 3:1 pass    |
| `--input` / `--background`                          |   4.83:1 | 3:1 pass    |
| `--input` / `--accent`                              |   4.39:1 | 3:1 pass    |

Host values: `--background=#ffffff`, `--container=#ffffff`, `--popover=#ffffff`, `--sidebar=#ffffff`, `--accent=#f4f4f5`, `--foreground=oklch(0.141 0.005 285.823)`, `--muted-foreground=oklch(44.2% 0.017 285.786)`, `--brand-text=oklch(48.8% 0.243 264.376)`, `--success=#087c54`, `--warning=#9c6300`, `--error=oklch(50.5% 0.213 27.518)`.

## Magic Blue proposed pair matrix

The preset background/surface colors remain existing values; primary/focus/status semantic mappings are proposed overrides. Disabled-only pairs are measured but exempt. Card/popover/sidebar/secondary aliases use their actual preset surface below.

| Text role            |             Background |         Container/card |                Popover |                Sidebar | Accent/status/secondary |
| -------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ----------------------: |
| `--foreground`       |                14.67:1 |                13.50:1 |                12.84:1 |                15.19:1 |                 11.67:1 |
| `--muted-foreground` |                 6.38:1 |                 5.87:1 |                 5.58:1 |                 6.61:1 |                  5.08:1 |
| `--text-disabled`    | 3.49:1 (inactive only) | 3.21:1 (inactive only) | 3.06:1 (inactive only) | 3.62:1 (inactive only) |  2.78:1 (inactive only) |
| `--brand-text`       |                 6.39:1 |                 5.88:1 |                 5.59:1 |                 6.62:1 |                  5.09:1 |
| `--success`          |                 6.75:1 |                 6.21:1 |                 5.90:1 |                 6.99:1 |                  5.37:1 |
| `--warning`          |                10.62:1 |                 9.78:1 |                 9.30:1 |                11.00:1 |                  8.45:1 |
| `--error`            |                 5.83:1 |                 5.36:1 |                 5.10:1 |                 6.04:1 |                  4.64:1 |
| `--info`             |                 6.39:1 |                 5.88:1 |                 5.59:1 |                 6.62:1 |                  5.09:1 |

| Pair                                                | Contrast | Requirement |
| --------------------------------------------------- | -------: | ----------- |
| `--primary-foreground` / `--primary`                |   6.54:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-hover`           |   5.03:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-active`          |   8.47:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive`        |   9.63:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-hover`  |   8.02:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-active` |  15.46:1 | 4.5:1 pass  |
| `--ring` / `--background`                           |   6.39:1 | 3:1 pass    |
| `--ring` / `--accent`                               |   5.09:1 | 3:1 pass    |
| `--input` / `--background`                          |   6.41:1 | 3:1 pass    |
| `--input` / `--accent`                              |   5.10:1 | 3:1 pass    |

Host values: `--background=#1c1b2e`, `--container=#232236`, `--popover=#262541`, `--sidebar=#191828`, `--accent=#2d2c48`, `--foreground=#eeeefc`, `--muted-foreground=#9d9bc7`, `--brand-text=oklch(70.7% 0.165 254.624)`, `--success=#4cb782`, `--warning=#f2c94c`, `--error=oklch(70.4% 0.191 22.216)`.

## Classic Dark proposed pair matrix

The preset background/surface colors remain existing values; primary/focus/status semantic mappings are proposed overrides. Disabled-only pairs are measured but exempt. Card/popover/sidebar/secondary aliases use their actual preset surface below.

| Text role            |             Background |         Container/card |                Popover |                Sidebar | Accent/status/secondary |
| -------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ----------------------: |
| `--foreground`       |                15.22:1 |                14.11:1 |                13.25:1 |                15.69:1 |                 12.90:1 |
| `--muted-foreground` |                 5.35:1 |                 4.96:1 |                 4.65:1 |                 5.51:1 |                  4.53:1 |
| `--text-disabled`    | 3.60:1 (inactive only) | 3.34:1 (inactive only) | 3.13:1 (inactive only) | 3.71:1 (inactive only) |  3.05:1 (inactive only) |
| `--brand-text`       |                 6.59:1 |                 6.11:1 |                 5.73:1 |                 6.79:1 |                  5.59:1 |
| `--success`          |                 6.95:1 |                 6.45:1 |                 6.05:1 |                 7.17:1 |                  5.90:1 |
| `--warning`          |                10.95:1 |                10.15:1 |                 9.53:1 |                11.29:1 |                  9.28:1 |
| `--error`            |                 6.01:1 |                 5.57:1 |                 5.23:1 |                 6.19:1 |                  5.09:1 |
| `--info`             |                 6.59:1 |                 6.11:1 |                 5.73:1 |                 6.79:1 |                  5.59:1 |

| Pair                                                | Contrast | Requirement |
| --------------------------------------------------- | -------: | ----------- |
| `--primary-foreground` / `--primary`                |   6.54:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-hover`           |   5.03:1 | 4.5:1 pass  |
| `--primary-foreground` / `--action-active`          |   8.47:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive`        |   9.63:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-hover`  |   8.02:1 | 4.5:1 pass  |
| `--destructive-foreground` / `--destructive-active` |  15.46:1 | 4.5:1 pass  |
| `--ring` / `--background`                           |   6.59:1 | 3:1 pass    |
| `--ring` / `--accent`                               |   5.59:1 | 3:1 pass    |
| `--input` / `--background`                          |   3.60:1 | 3:1 pass    |
| `--input` / `--accent`                              |   3.05:1 | 3:1 pass    |

Host values: `--background=#191a1f`, `--container=#1f2126`, `--popover=#24262c`, `--sidebar=#16171b`, `--accent=#26282e`, `--foreground=#eef0f3`, `--muted-foreground=#8a8f98`, `--brand-text=oklch(70.7% 0.165 254.624)`, `--success=#4cb782`, `--warning=#f2c94c`, `--error=oklch(70.4% 0.191 22.216)`.
