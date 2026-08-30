# Domain Docs

This repository uses a single-context domain documentation layout:

- `CONTEXT.md` at the repository root contains the domain glossary.
- `docs/adr/` contains architectural decision records.

## Before exploring, read these

- Read the root `CONTEXT.md`.
- Read ADRs under `docs/adr/` that affect the area being changed.

If these files don't exist, proceed silently. The domain-modeling workflows create them lazily when terminology or decisions are resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/adr/
└── apps/
    └── packages/
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether the language belongs to the project or note the gap for domain modeling.

## Flag ADR conflicts

If an output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding the decision.
