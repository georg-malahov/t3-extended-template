SHELL := /bin/bash

DOCKER_COMPOSE ?= docker compose
YARN ?= yarn

# Use Doppler for env injection if available and configured, otherwise fall back to .env.local
ifneq (,$(wildcard doppler.yaml))
  ENV_RUN ?= doppler run --
else ifneq (,$(wildcard .env.local))
  ENV_RUN ?= env $(shell grep -v '^\#' .env.local | xargs)
else
  ENV_RUN ?=
endif

.PHONY: install dev dev-local build start lint typecheck test test-unit test-e2e codegen db-push db-seed auth-generate auth-migrate

install:
	$(YARN) install

dev:
	$(DOCKER_COMPOSE) up --build

dev-local:
	$(ENV_RUN) $(YARN) dev

build:
	yarn db:generate && yarn build

start:
	$(YARN) start

lint:
	$(YARN) lint

typecheck:
	$(YARN) typecheck

test:
	$(YARN) test:unit

test-unit:
	$(YARN) test:unit

test-e2e:
	$(ENV_RUN) sh -c "yarn auth:migrate && yarn db:push && yarn test:e2e"

codegen:
	$(YARN) db:generate

db-push:
	$(ENV_RUN) $(YARN) db:push

db-seed:
	$(ENV_RUN) $(YARN) db:seed

auth-generate:
	$(ENV_RUN) $(YARN) auth:generate

auth-migrate:
	$(ENV_RUN) $(YARN) auth:migrate
