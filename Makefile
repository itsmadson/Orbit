# ORBIT — common operations
# Everything runs inside Docker; no host toolchain required.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: init
init: ## Copy .env.example to .env if missing
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

.PHONY: up
up: init ## Build and start the whole stack
	$(COMPOSE) up -d --build

.PHONY: start
start: init ## Start without rebuilding
	$(COMPOSE) up -d

.PHONY: down
down: ## Stop the stack (keeps data)
	$(COMPOSE) down

.PHONY: reset
reset: ## Stop and DELETE all data, then start fresh
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

.PHONY: logs
logs: ## Follow logs from all services
	$(COMPOSE) logs -f

.PHONY: ps
ps: ## Show service status
	$(COMPOSE) ps

.PHONY: migrate
migrate: ## Apply database migrations
	$(COMPOSE) exec orbit-api alembic upgrade head

.PHONY: migration
migration: ## Create a migration: make migration m="add table"
	$(COMPOSE) exec orbit-api alembic revision --autogenerate -m "$(m)"

.PHONY: seed
seed: ## Seed demo data (no-op if the company already exists)
	$(COMPOSE) exec orbit-api python -m app.seed

.PHONY: shell-api
shell-api: ## Shell inside the API container
	$(COMPOSE) exec orbit-api bash

.PHONY: shell-db
shell-db: ## psql inside the database container
	$(COMPOSE) exec orbit-db psql -U $${POSTGRES_USER:-orbit} -d $${POSTGRES_DB:-orbit}

.PHONY: backup
backup: ## Dump the database to backups/orbit-<timestamp>.sql.gz
	@mkdir -p backups
	$(COMPOSE) exec -T orbit-db pg_dump -U $${POSTGRES_USER:-orbit} $${POSTGRES_DB:-orbit} \
		| gzip > backups/orbit-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "Backup written to backups/"

.PHONY: restore
restore: ## Restore a dump: make restore f=backups/orbit-....sql.gz
	@test -n "$(f)" || (echo "Usage: make restore f=backups/orbit-....sql.gz" && exit 1)
	gunzip -c $(f) | $(COMPOSE) exec -T orbit-db psql -U $${POSTGRES_USER:-orbit} -d $${POSTGRES_DB:-orbit}

.PHONY: health
health: ## Check that every service answers
	@curl -fsS http://localhost:$${API_PORT:-8000}/health && echo
	@curl -fsS http://localhost:$${WEB_PORT:-3000}/api/health && echo
