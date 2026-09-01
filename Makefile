.PHONY: help setup dev up down db-migrate db-generate db-reset build test test-e2e lint format check-types clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Initial project setup (install dependencies + start database + run migrations)
	pnpm install
	$(MAKE) up
	@sleep 2
	$(MAKE) db-migrate

dev: ## Start dev servers (NestJS API and Client)
	pnpm dev

up: ## Start PostgreSQL container
	docker compose -f apps/server/compose.yaml up -d

down: ## Stop PostgreSQL container
	docker compose -f apps/server/compose.yaml down

db-migrate: ## Run Drizzle ORM database migrations
	pnpm --filter server db:migrate

db-generate: ## Generate new Drizzle migration files from schema
	pnpm --filter server db:generate

db-reset: ## Wipe database volume, restart container, and re-run migrations
	docker compose -f apps/server/compose.yaml down -v
	docker compose -f apps/server/compose.yaml up -d
	@sleep 2
	pnpm --filter server db:migrate

build: ## Build all packages and applications via Turborepo
	pnpm build

test: ## Run unit and integration tests across all packages
	pnpm test

test-e2e: ## Run NestJS end-to-end tests
	pnpm --filter server test:e2e

lint: ## Run ESLint across all packages
	pnpm lint

format: ## Format codebase with Prettier
	pnpm format

check-types: ## Check TypeScript types across all packages
	pnpm check-types

clean: ## Clean build artifacts and caches
	rm -rf .turbo dist */*/dist */*/.next */*/node_modules/.cache
