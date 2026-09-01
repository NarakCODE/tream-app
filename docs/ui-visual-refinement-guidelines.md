# UI Visual Refinement Guidelines

## Design Polish & Visual Consistency Specification

**Version:** 1.0  
**Purpose:** Define a consistent visual-refinement standard for modern application interfaces, with emphasis on hierarchy, density, optical alignment, typography, borders, radii, shadows, navigation, cards, inputs, and spatial rhythm.

---

## 1. Purpose

This document defines the final visual-polish layer applied after the product structure, UX flows, and component behavior are already correct.

The goal is not to redesign the application. The goal is to make an existing interface feel:

- more intentional,
- more visually balanced,
- less noisy,
- easier to scan,
- more consistent,
- more premium,
- and more coherent across screens.

This refinement layer should be applied systematically across the entire product rather than component-by-component with one-off values.

---

## 2. Core Design Principles

### 2.1 Reduce Visual Noise

Avoid allowing borders, separators, icons, headings, shadows, and containers to compete for attention.

Use subtle visual treatment for structural elements and stronger emphasis only where interaction or hierarchy requires it.

### 2.2 Preserve Clear Hierarchy

The interface should make it immediately obvious what is:

1. the page title,
2. the current section,
3. the primary content,
4. the supporting information,
5. the available actions,
6. and the passive chrome.

### 2.3 Use Consistent Rhythm

Spacing should be predictable across the application.

Use a limited set of spacing values rather than arbitrary gaps.

### 2.4 Prefer Optical Alignment Over Mechanical Alignment

Elements should look aligned, not merely share the same mathematical x-coordinate.

For rounded surfaces, titles and labels should visually align with the beginning of the internal text column rather than with the extreme edge of a curved container.

### 2.5 Make Interactive Elements Feel Interactive

Search fields, navigation rows, inputs, buttons, and selectable surfaces should have enough height, contrast, border definition, and feedback to communicate clickability.

### 2.6 Keep Secondary UI Secondary

Captions, grouping labels, metadata, dividers, helper text, and tertiary icons should support the interface without becoming visually dominant.

---

# 3. Design Token Baseline

The exact values may vary by product, but the following baseline should be used consistently.

## 3.1 Spacing Scale

Recommended spacing scale:

| Token | Value | Typical Use |
|---|---:|---|
| `space-1` | 4px | micro gaps, icon internals |
| `space-2` | 8px | compact icon/text gap |
| `space-3` | 12px | heading-to-card gap, compact control gaps |
| `space-4` | 16px | standard component spacing |
| `space-5` | 20px | compact section spacing |
| `space-6` | 24px | card padding |
| `space-8` | 32px | major section rhythm, nav group spacing |
| `space-10` | 40px | larger grouping |
| `space-12` | 48px | page content top padding |
| `space-16` | 64px | large layout separation |

Avoid arbitrary values unless there is a clear optical reason.

---

## 3.2 Border Thickness

### Default Rule

Use **0.5px visual hairlines** wherever the rendering environment supports them cleanly.

Apply to:

- shell dividers,
- navigation separators,
- card boundaries,
- input borders,
- table dividers,
- popover boundaries,
- dropdown boundaries,
- modal separators,
- and low-emphasis structural borders.

### Fallback

If 0.5px rendering is inconsistent across devices, use a 1px border with reduced opacity.

Example:

```css
border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
```

### Principle

Borders should organize content, not draw attention to themselves.

---

# 4. Corner Geometry

## 4.1 Corner Smoothing

Use approximately **60% corner smoothing** on rounded surfaces where the platform or design tool supports continuous/squircle-like corners.

Apply to:

- cards,
- buttons,
- inputs,
- search fields,
- navigation items,
- popovers,
- modals,
- image containers,
- badges,
- and interactive panels.

The purpose is to avoid overly geometric, mechanically circular corners.

## 4.2 Radius Scale

Recommended baseline:

| Component | Radius |
|---|---:|
| Small badge | 6px |
| Compact control | 8px |
| Standard input | 10px |
| Search field | 10px |
| Navigation item | 10px |
| Standard card | 12px |
| Large panel | 14–16px |
| Modal/dialog | 16px |
| Pill | 999px |

### Refinement Rule

Where older controls use 8px radii, prefer **10px** when increasing control height to around 36px.

This produces a softer and more modern balance.

---

# 5. Iconography

## 5.1 Stroke Width

Use approximately **1px icon strokes** for line icons when the icon set permits stroke adjustment.

Previous heavier values such as 1.33px can make icons appear visually stronger than adjacent text.

### Target

Icons should feel like part of the typography rather than separate illustrations.

## 5.2 Icon Sizing

Recommended sizes:

| Context | Icon Size |
|---|---:|
| Small metadata | 14px |
| Navigation | 16px |
| Standard button | 16px |
| Input leading icon | 16px |
| Primary toolbar action | 18px |
| Large empty state | 20–24px |

Avoid oversizing icons to compensate for weak contrast.

## 5.3 Icon/Text Gap

Recommended:

- 6px for dense navigation,
- 8px for standard controls,
- 10–12px for larger action rows.

For compact sidebar navigation, prefer a **tighter icon gap** than ordinary button layouts.

---

# 6. Typography

## 6.1 Typography Hierarchy

Recommended hierarchy:

| Role | Size | Weight | Tone |
|---|---:|---:|---|
| Page title | 20–24px | 600 | Primary |
| Major section title | 16–18px | 600 | Primary |
| Row title | 13px | 500–600 | Primary |
| Body | 13–14px | 400 | Primary/secondary |
| Section eyebrow | 12px | 500 | Muted |
| Caption | 11–12px | 500 | Muted |
| Metadata | 11–12px | 400 | Muted |

## 6.2 Row Titles

Refinement:

**14px → 13px**

Use tighter typography rather than adding excessive vertical spacing between the title and description.

Recommended:

```css
.row-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.row-description {
  font-size: 12px;
  line-height: 18px;
}
```

The title and description should feel like one information block.

## 6.3 Section Headings

Do not overuse bold 16px headings for every section.

Refinement:

**16px bold → 12px muted eyebrow label**

Example:

Before:

```text
General Settings
[Card]
```

After:

```text
General settings
[Card]
```

with the heading styled as a small muted caption.

### Why

Section captions should organize content without competing with the page title or content rows.

## 6.4 Letter Spacing

For body copy, use approximately **+1% tracking** where the typeface feels visually tight.

Equivalent CSS:

```css
letter-spacing: 0.01em;
```

Use carefully. This should relieve visual tension, not make text look artificially spaced.

## 6.5 Label Casing

Prefer **sentence case** over aggressive uppercase labels.

Avoid:

```text
ACCOUNT SETTINGS
AI TOOLS
WORKSPACE MEMBERS
```

Prefer:

```text
Account settings
AI tools
Workspace members
```

Uppercase should be reserved for rare utility labels, codes, or very small metadata where appropriate.

---

# 7. Optical Alignment

## 7.1 Text Column Alignment

Titles and labels should align to the **visual text column**, not necessarily to the rounded container edge.

In a rounded card, the curve creates an optical inset. A heading placed directly against the card's outer x-coordinate may look too far left.

### Rule

Align external headings with the internal content start position whenever possible.

Example:

```text
        General settings
      ╭──────────────────────────╮
      │  Workspace name          │
      │  Acme                    │
      ╰──────────────────────────╯
```

The heading should visually align with `Workspace name`, not necessarily with the absolute edge of the card.

## 7.2 Icon Optical Alignment

Icons may require a 1px optical adjustment depending on their shape.

Do not assume geometric centering always appears visually centered.

---

# 8. Page Layout

## 8.1 Content Top Padding

Refinement:

**36px → 48px**

Use approximately 48px between the top of the main content region and the first major page element.

This gives the page sufficient breathing room and separates content from persistent application chrome.

## 8.2 Page Width

Recommended content widths:

- compact settings page: 640–720px,
- standard app content: 800–960px,
- dashboard: responsive, usually 1100–1440px maximum,
- forms: 480–640px,
- reading content: 640–760px.

Avoid stretching settings forms across the full screen.

## 8.3 Section Rhythm

Use **32px** as the default vertical distance between major content sections.

Example:

```text
Section caption
12px
Card
32px
Next section caption
12px
Card
```

This provides consistent rhythm across screens.

---

# 9. Heading-to-Content Spacing

Refinement:

**16px → 12px** between a section caption and its associated card/content.

Why:

A section label and its content belong together and should therefore use a smaller gap than the spacing between independent sections.

Recommended relationship:

- caption → card: 12px,
- card → next section: 32px.

This reinforces grouping through proximity.

---

# 10. Cards and Surfaces

## 10.1 Surface Treatment

Avoid relying only on a visible border to define cards.

Refinement:

**border-only → explicit surface + subtle resting shadow**

Recommended card anatomy:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04),
              0 1px 3px rgb(0 0 0 / 0.03);
}
```

Do not use dramatic floating shadows for ordinary cards.

## 10.2 Card Hierarchy

Use surfaces carefully:

### Level 0
Page background.

### Level 1
Primary content card.

### Level 2
Nested interactive or selected surface.

### Level 3
Popover, dropdown, modal, or temporary floating surface.

Each level should be distinguishable without excessive contrast.

## 10.3 Card Padding

Recommended:

- compact card: 12–16px,
- standard card: 16–20px,
- settings card: 0px outer padding with padded rows,
- large content card: 24px.

For settings lists, applying padding at row level often produces cleaner separators.

---

# 11. Search Fields

## 11.1 Height

Refinement:

**search field → 36px height**

A search control should feel substantial enough to click while remaining compact.

## 11.2 Radius

Refinement:

**8px → 10px**

## 11.3 Border and Shadow

Search should be slightly more defined than passive surfaces.

Recommended:

```css
.search {
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-control);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}
```

### Focus

Use a clear but restrained focus state.

```css
.search:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
```

## 11.4 Internal Spacing

Recommended:

- horizontal padding: 10–12px,
- icon/text gap: 8px,
- icon size: 16px.

---

# 12. Navigation Items

## 12.1 Height

Refinement:

**navigation item → 36px**

This improves scanability and click targets while keeping navigation dense.

## 12.2 Radius

Refinement:

**8px → 10px**

## 12.3 Typography

Use a consistent medium weight across all navigation labels.

Recommended:

```css
font-size: 13px;
font-weight: 500;
```

Avoid mixing regular and medium weights arbitrarily.

## 12.4 Icon Gap

Prefer tighter icon-to-label spacing:

```css
gap: 8px;
```

or 6px for very dense navigation.

## 12.5 Active State

Active navigation should rely on a controlled combination of:

- slightly stronger surface,
- stronger text,
- optional subtle indicator,
- optional icon emphasis.

Avoid using all of the following simultaneously:

- bold text,
- bright background,
- large colored bar,
- heavy border,
- and high-saturation icon.

Use no more emphasis than necessary.

---

# 13. Navigation Groups

Refinement:

**20px → 32px spacing between navigation groups**

This helps the sidebar breathe and makes conceptual groups easier to scan.

Recommended structure:

```text
Main
  Home
  Inbox
  Tasks

32px

Workspace
  Members
  Settings

32px

Account
  Profile
  Billing
```

Within a group, use smaller spacing than between groups.

---

# 14. Group Captions

Avoid uppercase labels that visually dominate a sidebar.

Refinement:

**UPPERCASE → sentence case**

Recommended styling:

```css
.group-caption {
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  color: var(--text-muted);
}
```

Use captions for organization, not decoration.

---

# 15. Settings Rows

A typical settings row should contain:

- title,
- optional description,
- value or status,
- optional icon,
- optional action,
- optional switch/select/button.

## Recommended Dimensions

- row minimum height: 52–56px,
- horizontal padding: 16px,
- vertical padding: 12px,
- title: 13px,
- description: 12px,
- separator: 0.5–1px subtle hairline.

## Example

```text
Workspace name                            Acme Inc.
Shown across your workspace                      ›
```

Avoid oversized labels and excessive blank space between the title and description.

---

# 16. Inputs

## 16.1 Standard Height

Recommended:

- compact: 32px,
- standard: 36px,
- comfortable: 40px.

Use 36px as the default for dense desktop applications.

## 16.2 Radius

Recommended default: 10px.

## 16.3 Border

Inputs should be slightly stronger than passive card borders.

## 16.4 Focus State

Focus indication must be clearly visible and accessible.

Use border contrast plus a subtle outer ring.

---

# 17. Buttons

## 17.1 Height

Recommended:

- compact: 30–32px,
- standard: 36px,
- primary CTA: 40px.

## 17.2 Radius

Use 8–10px for standard buttons.

## 17.3 Typography

Recommended:

- 13px,
- 500–600 weight.

## 17.4 Hierarchy

Use clear button tiers:

1. Primary
2. Secondary
3. Ghost
4. Destructive

Avoid making every action look primary.

---

# 18. Dividers

Dividers should be nearly invisible until needed.

Recommended:

```css
border-color: rgb(0 0 0 / 0.08);
```

Dark mode:

```css
border-color: rgb(255 255 255 / 0.08);
```

Prefer spacing over dividers when grouping alone is sufficient.

---

# 19. Shadows

Use shadows to communicate elevation, not decoration.

## Resting Surface

```css
box-shadow:
  0 1px 2px rgb(0 0 0 / 0.04),
  0 1px 3px rgb(0 0 0 / 0.03);
```

## Popover

```css
box-shadow:
  0 8px 24px rgb(0 0 0 / 0.08),
  0 2px 8px rgb(0 0 0 / 0.06);
```

## Modal

Use a stronger but soft shadow, not a hard outline.

Avoid using shadows on every nested surface.

---

# 20. Color and Contrast

## 20.1 Text Hierarchy

Recommended semantic roles:

- `text-primary`
- `text-secondary`
- `text-muted`
- `text-disabled`
- `text-destructive`
- `text-success`

Do not create hierarchy by randomly reducing opacity on individual elements.

## 20.2 Surface Hierarchy

Recommended semantic roles:

- `background`
- `surface`
- `surface-subtle`
- `surface-hover`
- `surface-selected`
- `surface-elevated`

## 20.3 Border Hierarchy

- `border-subtle`
- `border-control`
- `border-hover`
- `border-focus`
- `border-destructive`

---

# 21. Hover, Active, and Focus States

Every interactive element should define:

- default,
- hover,
- active/pressed,
- focus-visible,
- disabled,
- selected when relevant.

Do not rely only on cursor changes.

## Suggested Transition

```css
transition:
  background-color 120ms ease,
  border-color 120ms ease,
  box-shadow 120ms ease,
  color 120ms ease;
```

Avoid slow decorative animations for ordinary controls.

---

# 22. Density Rules

Use density intentionally.

## Dense UI

Best for:

- dashboards,
- admin tools,
- developer tools,
- tables,
- sidebars,
- productivity applications.

Typical control height: 32–36px.

## Comfortable UI

Best for:

- onboarding,
- consumer apps,
- checkout,
- touch-heavy experiences.

Typical control height: 40–44px.

Do not mix densities randomly on the same screen.

---

# 23. Dark Mode

Dark mode should not simply invert light mode.

## Guidelines

- reduce pure white text usage,
- avoid pure black for every background layer,
- use subtle elevation changes,
- reduce border contrast,
- use shadows sparingly,
- use higher surface contrast instead of heavier borders.

Example hierarchy:

```text
Background        #0B0B0C
Surface           #111113
Elevated surface  #171719
Primary text      rgba(255,255,255,.92)
Secondary text    rgba(255,255,255,.68)
Muted text        rgba(255,255,255,.48)
Border            rgba(255,255,255,.08)
```

Values are examples only; use product tokens.

---

# 24. Responsive Behavior

The visual system should scale without losing hierarchy.

## Desktop

- 48px page top padding,
- 32px section rhythm,
- compact 36px controls,
- multi-column layouts where useful.

## Tablet

- reduce horizontal page padding,
- preserve 32px section rhythm where possible,
- avoid overly narrow content columns.

## Mobile

- increase touch target sizes where needed,
- standard controls should approach 40–44px,
- collapse side navigation appropriately,
- reduce container complexity,
- preserve hierarchy through spacing rather than borders.

---

# 25. Accessibility Requirements

Visual refinement must not reduce usability.

## Required

- maintain WCAG-appropriate contrast,
- ensure visible keyboard focus,
- maintain practical click/touch targets,
- do not encode state only through color,
- preserve readable font sizes,
- support browser zoom,
- support reduced-motion preferences.

Hairline borders must never be the sole indication of an important state.

---

# 26. Component-Level Checklist

## Shell

- [ ] Dividers use subtle hairlines.
- [ ] Sidebar groups use 32px spacing.
- [ ] Main content begins approximately 48px from the top.
- [ ] Page width is controlled.
- [ ] Shell chrome does not overpower content.

## Navigation

- [ ] Item height is approximately 36px.
- [ ] Radius is approximately 10px.
- [ ] Icon strokes visually match typography.
- [ ] Icon gap is tight and consistent.
- [ ] Labels use a consistent medium weight.
- [ ] Group labels use sentence case.
- [ ] Active state uses restrained emphasis.

## Cards

- [ ] Cards have an explicit surface.
- [ ] Border is subtle.
- [ ] Resting shadow is soft.
- [ ] Radius is consistent.
- [ ] Internal padding follows the spacing scale.

## Search

- [ ] Height is around 36px.
- [ ] Radius is approximately 10px.
- [ ] Border is visually stronger than passive cards.
- [ ] Focus state is clear.
- [ ] Leading icon aligns optically with text.

## Inputs

- [ ] Standard height is consistent.
- [ ] Radius is consistent.
- [ ] Label hierarchy is clear.
- [ ] Error/focus/disabled states are defined.

## Typography

- [ ] Page title is clearly dominant.
- [ ] Section captions are visually secondary.
- [ ] Row titles are approximately 13px.
- [ ] Body copy has comfortable line-height.
- [ ] Tracking is not overly tight.
- [ ] Unnecessary uppercase has been removed.

## Spacing

- [ ] Heading-to-card gap is around 12px.
- [ ] Section-to-section rhythm is around 32px.
- [ ] Main content top spacing is around 48px.
- [ ] Related items sit closer than unrelated items.
- [ ] Arbitrary one-off gaps have been removed.

---

# 27. Before and After Summary

| Area | Before | Refined |
|---|---|---|
| Hairlines | 1px | 0.5px or lower-opacity 1px |
| Corner smoothing | Basic radius | ~60% smoothing |
| Icon stroke | 1.33px | 1px |
| External alignment | Container edge | Internal text column |
| Body tracking | Default/tight | +0.01em where appropriate |
| Search height | Smaller | 36px |
| Search radius | 8px | 10px |
| Search treatment | Passive | Stronger border + subtle shadow |
| Nav height | Smaller | 36px |
| Nav radius | 8px | 10px |
| Nav icon gap | Loose | Tighter |
| Nav label weight | Mixed | Consistent medium |
| Group captions | UPPERCASE | Sentence case |
| Cards | Border only | Surface + border + resting shadow |
| Section headings | 16px bold | 12px muted eyebrow |
| Row titles | 14px | 13px |
| Page top padding | 36px | 48px |
| Heading-to-card | 16px | 12px |
| Section rhythm | Inconsistent | 32px |
| Nav group gap | 20px | 32px |

---

# 28. Implementation Strategy

Do not implement these refinements independently in every component.

Create shared design tokens and component primitives.

Recommended implementation order:

1. Define typography tokens.
2. Define spacing tokens.
3. Define radius tokens.
4. Define border tokens.
5. Define surface tokens.
6. Define elevation/shadow tokens.
7. Standardize input and button heights.
8. Standardize navigation primitives.
9. Standardize card primitives.
10. Apply page-layout rhythm.
11. Audit optical alignment.
12. Validate light and dark modes.
13. Validate responsive behavior.
14. Run accessibility checks.

---

# 29. Example CSS Tokens

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-control: 10px;
  --radius-card: 12px;
  --radius-panel: 16px;

  --control-h-compact: 32px;
  --control-h-default: 36px;
  --control-h-comfortable: 40px;

  --text-row-title: 13px;
  --text-body: 13px;
  --text-caption: 12px;

  --section-gap: 32px;
  --heading-content-gap: 12px;
  --page-top-padding: 48px;

  --border-subtle: rgb(0 0 0 / 0.08);
  --border-control: rgb(0 0 0 / 0.12);

  --shadow-resting:
    0 1px 2px rgb(0 0 0 / 0.04),
    0 1px 3px rgb(0 0 0 / 0.03);
}

.dark {
  --border-subtle: rgb(255 255 255 / 0.08);
  --border-control: rgb(255 255 255 / 0.12);
}
```

---

# 30. Example Tailwind Mapping

If using Tailwind CSS, map the rules to reusable semantic patterns rather than copying raw values everywhere.

Example:

```html
<div class="rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950">
  ...
</div>
```

Search field:

```html
<div class="flex h-9 items-center gap-2 rounded-[10px] border border-black/15 px-3 shadow-sm dark:border-white/15">
  ...
</div>
```

Navigation item:

```html
<button class="flex h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium">
  ...
</button>
```

Section caption:

```html
<p class="text-xs font-medium text-muted-foreground">
  General settings
</p>
```

---

# 31. Visual Review Procedure

After implementation, review each screen at 100% browser zoom and ask:

### Hierarchy

- What do I notice first?
- Is that the correct thing?
- Are captions competing with content?

### Alignment

- Do headings visually align with their content?
- Are icons optically centered?
- Do rows share a consistent text column?

### Rhythm

- Is spacing predictable?
- Are related items closer than unrelated items?
- Do sections breathe consistently?

### Density

- Does the interface feel compact without feeling cramped?
- Are control heights consistent?

### Borders

- Are any borders unnecessarily prominent?
- Can some dividers be replaced with spacing?

### Surfaces

- Can cards be distinguished without heavy outlines?
- Is elevation used only when meaningful?

### Typography

- Are there too many font sizes?
- Are there too many bold elements?
- Are secondary labels truly secondary?

### Interaction

- Does every clickable surface look clickable?
- Are hover/focus/selected states obvious but restrained?

---

# 32. Anti-Patterns to Avoid

Avoid:

- 1px dark borders around every component,
- inconsistent 8/10/12/14px radii without a system,
- uppercase captions everywhere,
- oversized section headings,
- excessive font-weight variation,
- arbitrary margins such as 18px, 22px, 27px,
- using shadows as decoration,
- oversized icons,
- low-contrast focus states,
- equal spacing between related and unrelated elements,
- full-width settings forms on large screens,
- active navigation states with too many simultaneous indicators,
- nesting multiple bordered cards inside bordered cards,
- decorative animation on routine interactions.

---

# 33. Definition of Done

A screen is visually refined when:

- visual hierarchy is immediately understandable,
- borders are subtle and consistent,
- card surfaces have controlled depth,
- corners use a coherent geometry system,
- navigation is compact and readable,
- titles and labels align optically,
- spacing follows a predictable rhythm,
- typography uses a limited hierarchy,
- interactive controls are clearly discoverable,
- light and dark modes feel equally intentional,
- accessibility remains intact,
- and no component appears visually louder than its functional importance warrants.

---

# 34. Final Design Direction

The intended aesthetic is:

**quiet, compact, precise, modern, structured, and premium.**

The interface should feel refined through consistency rather than decoration.

The best result is one where users do not consciously notice individual borders, radii, spacing values, or shadows. Instead, the product simply feels easier to understand, calmer to use, and more professionally constructed.

---

## Quick Reference

```text
Hairlines:          0.5px
Corner smoothing:   ~60%
Icon stroke:        ~1px
Search height:      36px
Search radius:      10px
Nav height:         36px
Nav radius:         10px
Row title:          13px
Section caption:    12px muted
Heading → content:  12px
Section rhythm:     32px
Nav group rhythm:   32px
Content top:        48px
Body tracking:      ~0.01em where appropriate
Cards:              surface + subtle border + resting shadow
Captions:           sentence case
Alignment:          optical text-column alignment
```

