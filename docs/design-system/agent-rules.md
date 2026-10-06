# Proposed UI agent rules

Status: documentation-only; not installed in AGENTS.md, CLAUDE.md or Cursor. For a future enforcement task, include the block below in one existing agent instruction file, or link it with the trigger: “For apps/web UI changes, read docs/design-system/agent-rules.md.” For Cursor, use the same body in a rule scoped to `apps/web/**/*.{tsx,css}`. Preserve existing repository instructions.

## Do

- For a web UI change, identify its route owner and runtime primitive; read DS-01 for colors, DS-02 for text, DS-03 for geometry and DS-04/05 for behavior before editing that category.
- Use semantic tokens from the approved single token source; use the documented spacing/type/radius scales and existing component variants.
- Document default, hover, focus, pressed/selected, disabled, loading and error behavior for each affected interaction; explicitly mark noninteractive states N/A.
- Give every control a name. Connect labels/errors to fields. Keep focus visible with an opaque 2px perimeter and offset. Preserve keyboard paths and focus restoration.
- Keep normal text at least 4.5:1, large text 3:1 and required control/focus indicators 3:1 against their actual adjacent colors; calculate composite colors where opacity remains.
- Record path/owner/reason/value/contrast/removal trigger for approved logo, label-data or dynamic-geometry exceptions.

## Don't

- Add literal hex/RGB/HSL/OKLCH, palette color classes or arbitrary appearance values at component call sites; add a reviewed semantic role instead.
- Override a primitive's fill, type, radius or height to create a local variant; extend its documented variant/size contract.
- Remove an outline without a verified replacement, rely on color alone, or use a placeholder/tooltip as the only name.
- Import the registry theme or invent `loading`, `success` or other unsupported runtime props; inspect the actual component API.
- Apply the token proposal in a documentation-only task; implementation requires a separate authorized task. Follow the approved DS-00 decisions when implementation is requested.

## Pre-merge UI checklist

- [ ] New/changed appearance uses approved semantic tokens and scales; exceptions have scoped records.
- [ ] Every applicable state is implemented and documented; async failure preserves input/data and exposes recovery.
- [ ] Icon-only controls and fields have accessible names; active navigation exposes aria-current.
- [ ] Keyboard focus is visible and unclipped; overlays trap/restore focus and preserve Escape/arrow-key behavior.
- [ ] Actual foreground/background and indicator pairs meet contrast thresholds in every retained theme.
- [ ] Targets meet the approved D3 policy; zoom/reflow and reduced motion are checked.
- [ ] Relevant lint/type checks and manual UI evidence are recorded with any unavailable checks stated plainly.
- [ ] Token docs, token source and migration exceptions agree; no broad unrelated changes are included.
