# SaaS Template

Greenfield SaaS starter built on Next.js 16, TypeScript, yarn, shadcn/ui, Better Auth, ZenStack v3, PostgreSQL 16, Vitest, Playwright, Docker, Coolify, and Doppler.

## Runtime

- Node `20.19.0+`
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
- Docker + Coolify for deployment
- Doppler for all runtime configuration

## Quick Start

1. Install Doppler and authenticate with `doppler login`.
2. Run `doppler setup`.
3. Make sure your Doppler `dev` config includes the environment variables listed below.
4. Start the full local stack with `make dev`.

That command runs `docker compose up --build` through Doppler so the app container receives the same environment values as CI, preview, and production.

## Make Targets

- `make dev`: run the Docker-first local stack.
- `make dev-local`: run Next.js directly on your machine through Doppler.
- `make build`: run a production build through Doppler.
- `make lint`: run ESLint.
- `make typecheck`: run TypeScript checks.
- `make test-unit`: run Vitest.
- `make test-e2e`: run Playwright.
- `make codegen`: regenerate ZenStack artifacts.
- `make auth-migrate`: apply Better Auth migrations.
- `make db-push`: push the ZenStack schema to PostgreSQL.
- `make db-seed`: seed the starter project for the first available user.

## Required Environment Variables

All environment variables are expected to come from Doppler. The app validates them in `src/lib/env.ts`.

- `APP_URL`
- `BETTER_AUTH_URL`
- `AUTH_SECRET`
- `DATABASE_URL`
- `AUTH_DATABASE_URL`
- `PLAYWRIGHT_BASE_URL` for CI and local E2E
- `DOPPLER_PROJECT`
- `DOPPLER_CONFIG`

Recommended Doppler configs:

- `dev`
- `test`
- `ci`
- `preview`
- `prod`

`AUTH_DATABASE_URL` should point to the same PostgreSQL instance as `DATABASE_URL`, but use PostgreSQL `search_path=auth` so Better Auth tables live in the `auth` schema while ZenStack app models stay in the default app schema.

## Local Development

`make dev` starts:

- `db`: PostgreSQL 16
- `app`: Next.js app container

The app container runs:

1. `yarn install`
2. `yarn db:generate`
3. `yarn auth:migrate`
4. `yarn db:push`
5. `yarn dev --hostname 0.0.0.0 --port 3000`

That gives every developer the same boot path on macOS, Linux, or Windows with Docker.

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

To run local E2E tests against a Doppler-configured environment:

1. Start the app with `make dev` or `make dev-local`.
2. Run `doppler run -- yarn auth:migrate`.
3. Run `doppler run -- yarn db:push`.
4. Run `make test-e2e`.

## CI And Coolify

GitHub Actions:

- `.github/workflows/ci.yml` runs schema generation, database prep, lint, typecheck, unit tests, and a production build.
- `.github/workflows/e2e.yml` runs Playwright against PostgreSQL 16.

Both workflows expect a `DOPPLER_TOKEN` secret and use the `ci` Doppler config.

Coolify:

- Use a normal app deployment for production.
- Enable native preview deployments for pull requests.
- Configure a wildcard preview domain.
- Keep preview Doppler config or scoped preview secrets separate from production.
- Prefer a dedicated PostgreSQL resource/service over bundling preview databases into a single Compose preview stack.

## Architecture

Next.js server code, Better Auth, and ZenStack all run in the same TypeScript app and share the same PostgreSQL backend. CRUD routes are generated from the ZenStack schema, and the frontend consumes typed TanStack Query hooks derived from the same source model.
# t3-extended-template
