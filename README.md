# SaaS Template

Greenfield SaaS starter built on Next.js 16, TypeScript, Bun, shadcn/ui, Better Auth, ZenStack v3, PostgreSQL 16, Vitest, Playwright, Docker, and Doppler.

## Runtime

- Bun `1.x`
- Docker Desktop or Docker Engine
- Doppler CLI

## Quick Start

1. Install Doppler and authenticate with `doppler login`.
2. Run `doppler setup`.
3. Make sure your Doppler `dev` config includes the environment variables listed below.
4. Build the dev container (first time only): `bun run image:build`
5. Start the full local stack with `bun run up`.

That command starts a single Docker container (`t3-template-ralphex`) with PostgreSQL 16, MinIO (S3), and the Next.js dev server. Doppler secrets are auto-downloaded and injected into the container.

## Commands

**Docker lifecycle:**

- `bun run up` — start the container + all services + dev server
- `bun run down` — stop and remove the container
- `bun run logs` — stream container logs
- `bun run dx bash` — interactive bash shell inside the container
- `bun run dx <cmd>` — run any command inside the container
- `bun run image:build` — build the `t3-template-ralphex` Docker image

**Direct commands (host or container):**

- `bun run lint` — ESLint
- `bun run typecheck` — TypeScript type checking
- `bun run build` — production build
- `bun run test:unit` — Vitest unit tests
- `bun run test:e2e` — Playwright E2E tests
- `bun run db:generate` — regenerate ZenStack artifacts after schema changes
- `bun run db:migrate:dev` — create a new migration (development only)
- `bun run db:migrate` — deploy pending migrations
- `bun run db:migrate:status` — check migration status
- `bun run db:seed` — seed sample data
- `bun run auth:generate` — generate Better Auth migration SQL
- `bun run auth:migrate` — apply Better Auth schema migrations

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

## Local Development

`bun run up` starts a single Docker container that runs:

- PostgreSQL 16
- MinIO (S3-compatible object storage)
- Next.js dev server

Each worktree gets its own container name, node_modules volume, and auto-assigned port — multiple worktrees can run `bun run up` simultaneously.

## Testing

- Vitest config lives in `vitest.config.mts`.
- Playwright config lives in `playwright.config.ts`.
- The starter E2E path covers sign-up and project CRUD.

To run E2E tests:

1. Start the app with `bun run up`.
2. Run `bun run dx bun run test:e2e`.

Playwright auto-starts the dev server via its `webServer` config, so E2E tests also work without `bun run up` when running inside the container.

## Architecture

Next.js server code, Better Auth, and ZenStack all run in the same TypeScript app and share the same PostgreSQL backend. CRUD routes are generated from the ZenStack schema, and the frontend consumes typed TanStack Query hooks derived from the same source model.

Architecture diagrams are maintained in `docs/architecture/` — regenerate with `/generate-docs`.
