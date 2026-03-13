SHELL := /bin/bash

DOCKER_COMPOSE ?= docker compose
YARN ?= yarn

.PHONY: install dev dev-local build start lint typecheck test test-unit test-e2e codegen db-push db-seed auth-generate auth-migrate

install:
	$(YARN) install

dev:
	$(DOCKER_COMPOSE) up --build

dev-local:
	$(YARN) dev

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
	yarn auth:migrate && yarn db:push && yarn test:e2e

codegen:
	$(YARN) db:generate

db-push:
	$(YARN) db:push

db-seed:
	$(YARN) db:seed

auth-generate:
	$(YARN) auth:generate

auth-migrate:
	$(YARN) auth:migrate
