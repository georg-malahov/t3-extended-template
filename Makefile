SHELL := /bin/bash

DOPPLER ?= doppler run --
DOCKER_COMPOSE ?= docker compose
YARN ?= yarn

.PHONY: install dev dev-local build start lint typecheck test test-unit test-e2e codegen db-push db-seed auth-generate auth-migrate

install:
	$(YARN) install

dev:
	$(DOPPLER) $(DOCKER_COMPOSE) up --build

dev-local:
	$(DOPPLER) $(YARN) dev

build:
	$(DOPPLER) sh -lc "yarn db:generate && yarn build"

start:
	$(DOPPLER) $(YARN) start

lint:
	$(YARN) lint

typecheck:
	$(YARN) typecheck

test:
	$(YARN) test:unit

test-unit:
	$(YARN) test:unit

test-e2e:
	$(DOPPLER) sh -lc "yarn auth:migrate && yarn db:push && yarn test:e2e"

codegen:
	$(DOPPLER) $(YARN) db:generate

db-push:
	$(DOPPLER) $(YARN) db:push

db-seed:
	$(DOPPLER) $(YARN) db:seed

auth-generate:
	$(DOPPLER) $(YARN) auth:generate

auth-migrate:
	$(DOPPLER) $(YARN) auth:migrate
