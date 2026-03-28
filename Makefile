SHELL := /bin/bash

YARN ?= yarn
IMAGE := ralphex-t3

# Derive a unique container name from the directory basename.
# Worktrees get different names → isolated containers, volumes, and ports.
CONTAINER := t3app-$(shell basename "$(CURDIR)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')
NM_VOLUME := $(CONTAINER)-nm

# Guard: targets that require the container call this first (evaluated at run time)
_require-container:
	@docker inspect -f '{{.State.Running}}' $(CONTAINER) 2>/dev/null | grep -q true \
	  || { echo "Error: container $(CONTAINER) is not running. Start it with 'make dev' first." >&2; exit 1; }

# Run a command inside the container. Evaluated at recipe execution time so it
# works correctly even when chained after `make dev` in a single invocation.
RUN = docker exec $(CONTAINER)

.PHONY: install dev build start lint typecheck test test-unit test-e2e test-e2e-report test-e2e-review codegen db-migrate db-migrate-dev db-migrate-status db-seed auth-generate auth-migrate shell logs stop ralphex-build _require-container

install:
	$(YARN) install

dev:
	@if docker inspect -f '{{.State.Running}}' $(CONTAINER) 2>/dev/null | grep -q true; then \
	  echo "Container $(CONTAINER) is already running."; \
	  port=$$(docker port $(CONTAINER) 3000/tcp 2>/dev/null | head -1 | cut -d: -f2); \
	  echo "App URL: http://localhost:$$port"; \
	  exit 0; \
	fi; \
	if ! docker image inspect $(IMAGE) >/dev/null 2>&1; then \
	  echo "Image $(IMAGE) not found. Run 'make ralphex-build' first." >&2; \
	  exit 1; \
	fi; \
	port="$${PORT:-}"; \
	if [ -z "$$port" ]; then \
	  port=$$(grep '^APP_PORT=' .env.local 2>/dev/null | cut -d= -f2); \
	fi; \
	if [ -z "$$port" ]; then \
	  port=$$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"); \
	  echo "APP_PORT=$$port" >> .env.local; \
	  echo "Auto-assigned APP_PORT=$$port"; \
	fi; \
	env_file_flag=""; \
	if command -v doppler >/dev/null 2>&1; then \
	  doppler secrets download --format env-no-quotes --no-file > .env.docker && chmod 600 .env.docker; \
	  env_file_flag="--env-file .env.docker"; \
	fi; \
	echo "Starting container $(CONTAINER) on port $$port..."; \
	docker run -d --init --name $(CONTAINER) \
	  -v "$(CURDIR)":/workspace \
	  -v $(NM_VOLUME):/workspace/node_modules \
	  -p "$$port:3000" \
	  $$env_file_flag \
	  -e APP_URL="http://localhost:$$port" \
	  -e BETTER_AUTH_URL="http://localhost:$$port/api/auth" \
	  -e PLAYWRIGHT_BASE_URL="http://localhost:3000" \
	  $(IMAGE) sleep infinity; \
	echo "Waiting for services (init.sh runs via entrypoint)..."; \
	pg_ready=0; \
	for i in $$(seq 1 60); do \
	  if docker exec $(CONTAINER) pg_isready -q 2>/dev/null; then pg_ready=1; break; fi; \
	  sleep 1; \
	done; \
	if [ "$$pg_ready" = "0" ]; then \
	  echo "ERROR: PostgreSQL failed to start" >&2; \
	  docker logs $(CONTAINER); \
	  exit 1; \
	fi; \
	nm_ready=0; \
	for i in $$(seq 1 30); do \
	  if docker exec $(CONTAINER) test -f /workspace/node_modules/.yarn-integrity; then nm_ready=1; break; fi; \
	  sleep 1; \
	done; \
	if [ "$$nm_ready" = "0" ]; then \
	  echo "ERROR: node_modules not populated" >&2; \
	  exit 1; \
	fi; \
	echo "Running codegen and migrations..."; \
	docker exec $(CONTAINER) yarn db:generate; \
	docker exec $(CONTAINER) yarn auth:migrate; \
	docker exec $(CONTAINER) yarn db:migrate; \
	echo "Starting dev server..."; \
	docker exec -d $(CONTAINER) yarn dev --hostname 0.0.0.0 --port 3000; \
	url="http://localhost:$$port"; \
	echo "Waiting for app at $$url..."; \
	app_ready=0; \
	for i in $$(seq 1 60); do \
	  if curl -sf "$$url" >/dev/null 2>&1; then \
	    echo "App ready at $$url"; \
	    app_ready=1; \
	    break; \
	  fi; \
	  sleep 2; \
	done; \
	if [ "$$app_ready" = "0" ]; then \
	  echo "ERROR: App failed to start at $$url" >&2; \
	  docker logs $(CONTAINER); \
	  exit 1; \
	fi

build: _require-container
	$(RUN) sh -c "yarn db:generate && yarn build"

start: _require-container
	$(RUN) $(YARN) start

lint: _require-container
	$(RUN) $(YARN) lint

typecheck: _require-container
	$(RUN) $(YARN) typecheck

test: _require-container
	$(RUN) $(YARN) test:unit

test-unit: _require-container
	$(RUN) $(YARN) test:unit

test-e2e: _require-container
	docker exec -e TRACE_ALL=$(TRACE_ALL) $(CONTAINER) $(YARN) test:e2e

# Opens the Playwright HTML report in your browser (traces, screenshots, videos)
test-e2e-report:
	npx playwright show-report

# Manual review: run ALL E2E tests with full traces, then open the HTML report.
# Host-only — not for CI, ralphex, or automated workflows.
test-e2e-review: _require-container
	docker exec -e TRACE_ALL=1 $(CONTAINER) $(YARN) test:e2e; \
	npx playwright show-report

codegen: _require-container
	$(RUN) $(YARN) db:generate

db-migrate: _require-container
	$(RUN) $(YARN) db:migrate

# Interactive-only: requires a TTY (prompts for migration name). Not for CI/automation.
db-migrate-dev: _require-container
	@if [ ! -t 0 ]; then echo "ERROR: db-migrate-dev requires an interactive terminal. Use 'make db-migrate' to deploy existing migrations." >&2; exit 1; fi
	docker exec -it $(CONTAINER) $(YARN) db:migrate:dev

db-migrate-status: _require-container
	$(RUN) $(YARN) db:migrate:status

db-seed: _require-container
	$(RUN) $(YARN) db:seed

auth-generate: _require-container
	$(RUN) $(YARN) auth:generate

auth-migrate: _require-container
	$(RUN) $(YARN) auth:migrate

shell: _require-container
	docker exec -it $(CONTAINER) bash

logs: _require-container
	docker logs -f $(CONTAINER)

stop:
	docker rm -f $(CONTAINER) 2>/dev/null || true
	-docker volume rm $(NM_VOLUME) 2>/dev/null || true
	rm -f .env.docker

# Build the custom ralphex Docker image (PostgreSQL + MinIO + Playwright + full dev toolchain)
ralphex-build:
	docker build -t ralphex-t3 -f .claude/docker/Dockerfile.ralphex .
	@echo "Removing stale ralphex node_modules volumes (will be repopulated on next run)..."
	-docker volume ls -q --filter 'name=-nm$$' | grep t3app | xargs -r docker volume rm 2>/dev/null || true
