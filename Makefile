SHELL := /bin/bash

DOCKER_COMPOSE ?= docker compose
YARN ?= yarn

# Auto-detect: if the 'app' container is running, exec commands inside it
DOCKER_APP_RUNNING := $(shell $(DOCKER_COMPOSE) ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^app$$' && echo 1)

ifeq ($(DOCKER_APP_RUNNING),1)
  # Container is running — exec inside it, env vars already set by docker-compose
  RUN := $(DOCKER_COMPOSE) exec -T app
  ENV_RUN :=
else
  # No container — run locally with env injection
  RUN :=
  ifneq (,$(wildcard doppler.yaml))
    ENV_RUN ?= doppler run --
  else ifneq (,$(wildcard .env.local))
    ENV_RUN ?= env $(shell grep -v '^\#' .env.local | xargs)
  else
    ENV_RUN ?=
  endif
endif

.PHONY: install dev dev-local build start lint typecheck test test-unit test-e2e codegen db-push db-seed auth-generate auth-migrate shell

install:
	$(YARN) install

dev:
	$(DOCKER_COMPOSE) up --build

dev-local:
	$(ENV_RUN) $(YARN) dev

build:
	$(RUN) sh -c "yarn db:generate && yarn build"

start:
	$(YARN) start

lint:
	$(RUN) $(YARN) lint

typecheck:
	$(RUN) $(YARN) typecheck

test:
	$(RUN) $(YARN) test:unit

test-unit:
	$(RUN) $(YARN) test:unit

test-e2e:
ifeq ($(DOCKER_APP_RUNNING),1)
	$(RUN) $(YARN) test:e2e
else
	$(ENV_RUN) sh -c "yarn auth:migrate && yarn db:push && yarn test:e2e"
endif

codegen:
	$(RUN) $(YARN) db:generate

db-push:
	$(RUN) $(ENV_RUN) $(YARN) db:push

db-seed:
	$(RUN) $(ENV_RUN) $(YARN) db:seed

auth-generate:
	$(RUN) $(ENV_RUN) $(YARN) auth:generate

auth-migrate:
	$(RUN) $(ENV_RUN) $(YARN) auth:migrate

shell:
ifeq ($(DOCKER_APP_RUNNING),1)
	$(DOCKER_COMPOSE) exec app bash
else
	@echo "Error: app container is not running. Start it with 'make dev' first."
	@exit 1
endif
