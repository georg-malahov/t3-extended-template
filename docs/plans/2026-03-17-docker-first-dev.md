# Docker-First Development Workflow

## Overview
- Make all Makefile commands (lint, typecheck, test-unit, test-e2e, codegen, db-push, etc.) auto-detect the running `app` Docker container and execute inside it
- When `make dev` is running, every other `make` target transparently routes through `docker compose exec app`
- When no container is running, commands fall back to local execution (current behavior)
- Install Playwright Chromium + system deps inside the container so E2E tests run headlessly in Docker
- This enables ralphex to run full validation (lint, typecheck, tests, e2e) against the Dockerized app without any manual setup

## Context
- Files involved: `Makefile`, `Dockerfile`, `docker-compose.yml`, `.ralphex/prompts/task.txt`
- The `app` service in docker-compose uses `target: deps` (node:24-alpine) — no browsers installed
- Playwright needs Chromium + system libraries (GTK, NSS, etc.) which Alpine doesn't have by default
- Current Makefile commands run on host, requiring local node_modules and env vars
- ralphex task prompt validates with `make lint && make typecheck && make test-unit`

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- Complete each task fully before moving to the next
- Make small, focused changes
- CRITICAL: every task MUST include new/updated tests for code changes in that task
- CRITICAL: all tests must pass before starting next task
- CRITICAL: update this plan file when scope changes during implementation
- Run tests after each change
- Maintain backward compatibility — local execution still works when no container is running

## Testing Strategy
- Unit tests: not applicable (infrastructure/config changes)
- Manual validation: `make dev` → then `make lint`, `make typecheck`, `make test-unit`, `make test-e2e` all execute inside container
- Verify fallback: stop containers → same commands run locally as before
- E2E: `make test-e2e` runs Playwright headless Chromium inside the container successfully

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Add Playwright browser support to Docker image
- [x] Update `Dockerfile`: added separate `dev` stage based on `node:24-bookworm-slim` (Debian) with Playwright Chromium + system deps
- [x] Add `RUN npx playwright install --with-deps chromium` in the `dev` stage
- [x] Keep the `runner` stage (production) on Alpine — only `dev` (docker-compose target) changes
- [x] Update `docker-compose.yml` to target `dev` stage and set `PLAYWRIGHT_BASE_URL=http://localhost:3000`
- [x] Test: `make dev` starts successfully, app accessible at http://localhost:3000 from host

### Task 2: Add auto-detect logic to Makefile
- [x] Add a `DOCKER_APP_RUNNING` variable that checks if the `app` container is running
- [x] Add a `RUN` variable: if `DOCKER_APP_RUNNING=1`, set to `$(DOCKER_COMPOSE) exec -T app`; otherwise empty (local execution)
- [x] Update targets to use `$(RUN)`: `lint`, `typecheck`, `test-unit`, `test-e2e`, `codegen`, `db-push`, `db-seed`, `auth-generate`, `auth-migrate`, `build`
- [x] For `test-e2e` in Docker mode: just exec `yarn test:e2e` (no auth:migrate/db:push needed — ran at container startup)
- [x] Keep `dev`, `dev-local`, `install`, `start` unchanged
- [x] Add `make shell` target for interactive bash in the container
- [x] Test: with `make dev` running, `make lint` executes inside container; without container, runs locally

### Task 3: Update ralphex task prompt for Docker-aware validation
- [x] Update `.ralphex/prompts/task.txt` validation step with Docker auto-detect awareness
- [x] Add note that `make test-e2e` is available for E2E validation in Docker mode
- [x] Verified ralphex config (`.ralphex/config`) — no changes needed

### Task 4: Verify acceptance criteria
- [x] Start `make dev`, confirm app boots and is accessible
- [x] Run `make lint` — executes inside container (`docker compose exec -T app yarn lint`)
- [x] Run `make typecheck` — executes inside container
- [x] Run `make test-unit` — 2 tests pass inside container
- [x] Run `make test-e2e` — 13 tests pass with headless Chromium inside container
- [x] Stop containers, `make -n lint` shows local fallback (`yarn lint`)
- [x] Run `make codegen` inside container — ZenStack generation works
- [x] Run `make shell` — verified by code inspection (requires TTY, cannot verify in automated runs)
- ➕ Fixed pre-existing E2E test bugs: strict mode violations with `getByText('ACTIVE')` and `getByText(name)` — replaced with `getByRole('cell', ...)` and `getByRole('heading', ...)`

### Task 5: Update documentation
- [x] Update `CLAUDE.md` Makefile section to document Docker auto-detection behavior
- [x] Add note about `make shell` for debugging
- [x] Document that `make test-e2e` now works in Docker with headless Chromium

## Technical Details

### Auto-detection mechanism
```makefile
# Check if 'app' container from docker compose is running
DOCKER_APP_RUNNING := $(shell docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^app$$' && echo 1)

ifeq ($(DOCKER_APP_RUNNING),1)
  RUN_CMD := $(DOCKER_COMPOSE) exec app
  # No ENV_RUN needed inside container — env vars are set by docker-compose
  ENV_RUN :=
else
  RUN_CMD :=
  # existing ENV_RUN logic for local
endif
```

### Dockerfile dev stage
```dockerfile
FROM node:24-bookworm-slim AS dev
RUN apt-get update && apt-get install -y --no-install-recommends bash git make procps && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json yarn.lock .yarnrc ./
RUN yarn install --frozen-lockfile
RUN npx playwright install --with-deps chromium
```

### E2E inside container
- `PLAYWRIGHT_BASE_URL=http://localhost:3000` — the dev server runs in the same container
- `reuseExistingServer: true` in playwright.config.ts means Playwright won't try to start another dev server
- Headless Chromium runs inside the container — no X11/display needed

## Post-Completion
- Test with ralphex autonomous run: `ralphex docs/plans/<test-plan>.md` while `make dev` is running
- Consider adding Playwright test report output to a mounted volume for host-side viewing
- Consider CI/CD integration: same Docker image can run in CI pipelines
