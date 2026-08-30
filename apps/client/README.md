# Client App (`apps/client`)

Frontend Next.js application for Tream App, featuring project management, timeline gantt views, task boards, and workspace settings.

## Getting Started

From the monorepo root:

```bash
# Run in development mode (alongside apps/server)
pnpm dev

# Or run client only
pnpm --filter client dev
```

The application runs on [http://localhost:3000](http://localhost:3000).

## Building & Typechecking

```bash
# Type check
pnpm --filter client check-types

# Production build
pnpm --filter client build
```
