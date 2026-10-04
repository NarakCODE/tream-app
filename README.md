> Server status: M01–M09 implement persisted authentication, transactional commands/events/audit, workspace RBAC, readiness, teams, workflows, projects, milestones, issues, cycles and collaboration. Later product/CRM modules remain scaffolds. See [server setup](apps/server/README.md), [M01–M04 notes](apps/server/docs/M01-M04.md), [M05 notes](apps/server/docs/M05.md) and [M06 notes](apps/server/docs/M06.md) and [M07–M09 notes](apps/server/docs/M07-M09.md). Retained database history is upgraded incrementally; the complete target ERD is not yet materialized.

# Tream Monorepo

Enterprise workspace platform powered by **NestJS** (`apps/server`), **Next.js + React 19** (`apps/client`), and **Turborepo**.

AI agents are deferred beyond the MVP. The application excludes agent chat,
AI-agent settings, agent personalization, and the Agent Core backend. Historical
agent specifications in `PRD.md` describe future work, not current functionality.

---

## 📦 Project Structure

```text
apps/
├── client/     # Vite + React 19 + TanStack Router client app (port 3000)
├── server/     # NestJS + Fastify + Drizzle ORM backend API (port 3002)
├── web/        # Next.js landing/marketing application (port 3000)
└── docs/       # Documentation application (port 3001)

packages/
├── ui/                 # Shared React component library
├── eslint-config/      # Workspace ESLint configurations
└── typescript-config/  # Shared tsconfig base presets
```

---

## ⚡ Quick Start (Makefile)

A root [`Makefile`](./Makefile) is provided for quick developer setup and Docker orchestration:

```bash
# 1. First-time setup (installs deps, starts Postgres, runs migrations)
make setup

# 2. Start full-stack development servers (NestJS API + Client)
make dev

# 3. View all available make targets
make help
```

### Common Developer Commands

| Command            | Action                                                                |
| :----------------- | :-------------------------------------------------------------------- |
| `make setup`       | Install dependencies, boot Postgres container, run Drizzle migrations |
| `make dev`         | Start development servers (`server` + `client`)                       |
| `make up`          | Start PostgreSQL container via Docker Compose                         |
| `make down`        | Stop PostgreSQL container                                             |
| `make db-migrate`  | Run database migrations via Drizzle ORM                               |
| `make db-generate` | Generate migration SQL files from schema changes                      |
| `make db-reset`    | Wipe database volume, restart container, and re-run migrations        |
| `make build`       | Build all packages and applications via Turborepo                     |
| `make test`        | Run all test suites across the monorepo                               |
| `make test-e2e`    | Run NestJS end-to-end test suite                                      |
| `make lint`        | Run ESLint across all packages                                        |
| `make format`      | Apply Prettier formatting across the repository                       |
| `make check-types` | Typecheck all workspace packages in strict mode                       |

---

## 🛠️ Turborepo & pnpm CLI

You can also run Turborepo tasks directly using `pnpm`:

```bash
# Run dev tasks across all apps
pnpm dev

# Build all applications
pnpm build

# Type check all packages
pnpm check-types

# Run tests
pnpm test

# Target a specific workspace package
pnpm --filter client dev
pnpm --filter server dev
pnpm --filter server test:e2e
```
