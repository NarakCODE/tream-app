# Lint and review enforcement proposal

No lint/config changes are applied. `apps/web/eslint.config.mjs` registers `@shadcn/lint` but enables none of its rules. The installed plugin source exposes `no-arbitrary-values` and `no-restyle`; the former targets arbitrary appearance utilities, not every bracket variant or dynamic geometry expression.

## Incremental activation

1. Add a separate, reviewed flat-config block for owned runtime component/feature files. Start warnings on the current baseline and errors for new violations; avoid broad --fix. Keep the vendored data-table-filter policy explicit.
2. Enable `shadcn/no-arbitrary-values` for appearance values and `shadcn/no-restyle` for component call-site appearance overrides. Verify installed rule schema/component recognition before adding options; defaults may also restrict spacing and size overrides, so resolve D3/contracts first.
3. Add narrow component contracts for approved layout props, named size variants and dynamic width/position. Baseline exact path/component/class occurrences with an owner and removal trigger; a count-only baseline lets one new violation replace an old one.
4. Escalate to errors on migrated files, then expand scope as the migration removes violations. Run ESLint through the project's Turbo lint task after confirming the current task's executable; the package still advertises `next lint`, so command compatibility must be checked in the future implementation task.

Illustrative addition to the existing plugin registration (proposal, not a tested full config):

```js
{
  files: ['components/**/*.{ts,tsx}', 'features/**/*.{ts,tsx}'],
  rules: {
    'shadcn/no-arbitrary-values': 'warn',
    'shadcn/no-restyle': 'warn',
  },
}
```

This catches classes like `bg-[#6771c5]` and appearance restyling of shared primitives. It does not, by itself, ban a named palette utility such as `text-blue-500`, a raw `stroke="#6771c5"`, or computed inline styles. Do not claim it enforces the whole token policy.

## Additional rules to implement or configure

| Suggested custom rule               | Detection and permitted exceptions                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-system/no-literal-ui-color` | AST inspect JSX fill/stroke/color props, style-object appearance keys, CSS-in-JS/template strings and constant colors that flow into UI. Reject hex (including 3/4/6/8 digit), rgb/rgba/hsl/hsla/oklch/oklab/color-mix literals outside the approved token source. Allow reviewed logo/swatch/user-data modules; reject unknown dynamic UI colors pending a typed data boundary |
| `design-system/semantic-color-only` | Parse Tailwind class strings in className, cn, CVA and templates; strip variants; reject named palette color utilities outside tokens/data exceptions; allow semantic role names. Allow data-[state=…]/has-[…] variants, not arbitrary color values                                                                                                                             |
| `design-system/named-scale-only`    | Restrict appearance spacing/radius/font/shadow values to DS-02/03. Allow documented computed timeline/grid width/left/transform and Radix size variables; do not block all arbitrary syntax                                                                                                                                                                                     |
| `design-system/icon-control-name`   | Require aria-label, aria-labelledby or visible/sr-only name for icon-only Button/button/Link targets; account for asChild forwarding. Static analysis cannot prove a conditional descendant name always renders                                                                                                                                                                 |

These custom rule names are proposals, not installed packages or currently callable rules. A regex in `no-restricted-syntax` is insufficient for escaped/template/dynamic values and may confuse user data or assets with styling. Use an AST rule plus CSS parsing, or start with a read-only inventory-diff gate while the custom rules are built. CSS linting should restrict literal colors outside the token file and validate semantic variable references; do not add a new dependency in this task.

## What lint cannot certify

Contrast needs foreground, host surface and opacity composition; measure actual pairs. Target size needs layout/spacing context. Keyboard navigation, screen-reader names, portal focus trapping, retained-theme/custom-theme behavior, reduced motion and clipped rings need browser evidence. Keep the [agent pre-merge checklist](agent-rules.md) alongside lint. Static state selectors do not prove that async failures are handled.

Use the reproducible scanner as a baseline report, not an unconditional failure gate: it includes comments, mock data, SVG logos, registry code and arbitrary variants. Any inventory gate must compare approved locations rather than total counts and must report which values and paths changed.
