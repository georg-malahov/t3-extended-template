# SaaS Template

Greenfield SaaS starter built on Next.js 16, TypeScript, yarn, shadcn/ui, Better Auth, ZenStack v3, PostgreSQL 16, Vitest, Playwright, Docker, and Doppler.

## Runtime

- Node `24+`
- yarn `1.22.22`
- Docker Desktop or Docker Engine
- Doppler CLI

## Stack Overview

- Next.js 16 App Router with strict TypeScript
- shadcn/ui-style open-code components with Radix primitives where needed
- Better Auth for email/password auth
- ZenStack v3 for schema-driven ORM, policies, and generated RPC CRUD API
- TanStack Query for type-safe frontend data access
- PostgreSQL 16 for local, preview, and production data
- Vitest for unit tests
- Playwright for end-to-end tests
- Docker (single `t3-template-ralphex` container) for local development
- Doppler for all runtime configuration

## Quick Start

1. Install Doppler and authenticate with `doppler login`.
2. Run `doppler setup`.
3. Make sure your Doppler `dev` config includes the environment variables listed below.
4. Build the dev container (first time only): `make ralphex-build`
5. Start the full local stack with `make dev`.

That command starts a single Docker container (`t3-template-ralphex`) with PostgreSQL 16, MinIO (S3), and the Next.js dev server. Doppler secrets are auto-downloaded and injected into the container.

## Make Targets

- `make dev`: start the container + all services + dev server.
- `make stop`: stop and remove the container.
- `make logs`: stream container logs.
- `make shell`: interactive bash shell inside the container.
- `make build`: run a production build.
- `make lint`: run ESLint.
- `make typecheck`: run TypeScript checks.
- `make test-unit`: run Vitest.
- `make test-e2e`: run Playwright E2E tests (inside container).
- `make codegen`: regenerate ZenStack artifacts after schema changes.
- `make db-migrate-dev`: create a new migration (development only).
- `make db-migrate`: deploy pending migrations to the database.
- `make db-migrate-status`: check migration status.
- `make db-seed`: seed sample data.
- `make auth-generate`: generate Better Auth migration SQL.
- `make auth-migrate`: apply Better Auth schema migrations.
- `make ralphex-build`: build the `t3-template-ralphex` Docker image.

## Required Environment Variables

All environment variables are expected to come from Doppler. The app validates them in `src/lib/env.ts`.

- `APP_URL`
- `BETTER_AUTH_URL`
- `AUTH_SECRET`
- `DATABASE_URL`

Optional:

- `AUTH_DATABASE_URL` (auto-derived from `DATABASE_URL` with `search_path=auth`)
- `PLAYWRIGHT_BASE_URL` for CI and local E2E
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- `BLOB_READ_WRITE_TOKEN` (when set, Vercel Blob is used instead of MinIO)

`AUTH_DATABASE_URL` should point to the same PostgreSQL instance as `DATABASE_URL`, but use PostgreSQL `search_path=auth` so Better Auth tables live in the `auth` schema while ZenStack app models stay in the default app schema.

## Local Development

`make dev` starts a single Docker container that runs:

- PostgreSQL 16
- MinIO (S3-compatible object storage)
- Next.js dev server

Each worktree gets its own container name, node_modules volume, and auto-assigned port — multiple worktrees can run `make dev` simultaneously.

## Auth And Data Model

The application models live in `zenstack/schema.zmodel`.

Starter entities:

- `User`
- `Organization`
- `Membership`
- `Project`

ZenStack generates:

- `src/lib/zenstack/generated/schema.ts`
- `src/lib/zenstack/generated/schema-lite.ts`
- `src/lib/zenstack/generated/models.ts`
- `src/lib/zenstack/generated/input.ts`

The generated RPC API is mounted at `src/app/api/model/[...path]/route.ts`, and the frontend consumes typed hooks from the same schema through `@zenstackhq/tanstack-query`.

## Authentication Flow

- Better Auth is configured in `src/lib/auth.ts`.
- Next.js route handlers are mounted in `src/app/api/auth/[...all]/route.ts`.
- On sign-up, a post-auth hook provisions the matching app `User`, default `Organization`, and `Membership`.
- The dashboard protects `/dashboard` through `proxy.ts` for optimistic redirects and still validates sessions server-side.

## Testing

- Vitest config lives in `vitest.config.mts`.
- Playwright config lives in `playwright.config.ts`.
- The starter E2E path covers sign-up and project CRUD.

To run E2E tests:

1. Start the app with `make dev`.
2. Run `make test-e2e`.

Playwright auto-starts the dev server via its `webServer` config, so E2E tests also work without `make dev` when running inside the container.

## CI

GitHub Actions:

- `.github/workflows/ci.yml` runs schema generation, database prep, lint, typecheck, unit tests, E2E tests (sharded), and a production build — all inside the `t3-template-ralphex` Docker container.
- `.github/workflows/build-dev-image.yml` builds and caches the dev Docker image for CI.

Both workflows expect a `DOPPLER_TOKEN` secret and use the `ci` Doppler config.

## Architecture

Next.js server code, Better Auth, and ZenStack all run in the same TypeScript app and share the same PostgreSQL backend. CRUD routes are generated from the ZenStack schema, and the frontend consumes typed TanStack Query hooks derived from the same source model.

Architecture diagrams are maintained in `docs/architecture/` — regenerate with `/generate-docs`.
