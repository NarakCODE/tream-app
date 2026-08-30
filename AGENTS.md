# Repository Guidelines

## Project Structure & Module Organization

This pnpm/Turborepo workspace contains deployable applications in `apps/` and shared code/configuration in `packages/`.

- `apps/web` is the primary Next.js app (port 3000); `apps/docs` is the docs app (port 3001). Route code lives in each app's `app/` directory and static files in `public/`.
- `apps/server` is the NestJS API. Keep runtime code in `src/`, unit specs beside source as `*.spec.ts`, and end-to-end tests in `test/`.
- `packages/ui/src` provides shared React components. `packages/eslint-config` and `packages/typescript-config` own shared tooling defaults.

Do not edit generated directories such as `.next/`, `dist/`, `coverage/`, or `node_modules/`.

## Build, Test, and Development Commands

Use Node 24+ and pnpm 11 (`pnpm install` at the repository root).

- `pnpm dev` runs workspace development tasks through Turborepo.
- `pnpm --filter server dev` starts the Nest API in watch mode; from `apps/server`, `pnpm dev` does the same.
- `pnpm build`, `pnpm lint`, and `pnpm check-types` run the corresponding workspace tasks.
- `pnpm --filter server test` runs Jest unit tests; append `test:e2e` for the Nest end-to-end suite.
- `pnpm format` applies Prettier to TypeScript, TSX, and Markdown files.

## Coding Style & Naming Conventions

Write TypeScript. Follow the surrounding file's quote and indentation style; the server's Prettier configuration requires single quotes and trailing commas. Use PascalCase for React components and Nest classes, camelCase for variables/functions, and kebab-case for non-component filenames. Keep shared UI exports in `packages/ui/src` and consume them as `@repo/ui/*`.

Run the relevant package lint and type checks before submitting. Avoid broad `--fix` runs unless you intend to include every resulting change.

## Testing Guidelines

NestJS uses Jest with `ts-jest`. Name unit tests `*.spec.ts` under `apps/server/src`; keep integration coverage in `apps/server/test` and run it with `pnpm --filter server test:e2e`. No repository-wide coverage threshold is configured; add focused tests for changed server behavior.

## Commits & Pull Requests

The visible history contains only the initial scaffold, so no commit convention is established. Use short imperative subjects (for example, `Add workspace invitation endpoint`). Keep commits focused. Pull requests should summarize behavior, list validation commands, link the relevant issue, and include screenshots for visual web/docs changes. Call out configuration or migration changes explicitly.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain documentation layout. See `docs/agents/domain.md`.
