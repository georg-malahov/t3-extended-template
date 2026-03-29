# CLAUDE.md — Project conventions for AI agents

## Project overview

T3 Extended SaaS Template — multi-tenant SaaS starter. Schema-driven development with end-to-end type safety.

**Tech Stack:** Next.js 16.1 (App Router, RSC), React 19.2, TypeScript 5.9 (strict), yarn 1.22.22,
ZenStack v3 (schema-first ORM → Prisma + TS types + TanStack Query hooks),
Better Auth 1.5 (PostgreSQL adapter), PostgreSQL 16, Kysely,
shadcn/ui, Radix UI, Tailwind CSS 4.2, TanStack Query 5.90, TanStack Table 8.21,
React Hook Form 7.71, Zod 4.3, next-themes, Lucide React, Sonner,
Vitest 4.0, Playwright 1.58, Docker, Doppler (env management).

## Environment setup

Development uses a single `ralphex-t3` Docker container that includes PostgreSQL 16, MinIO (S3), Doppler CLI, GitHub CLI, Node.js 24, and Playwright Chromium. No host-native setup required beyond Docker.

```bash
make ralphex-build   # build the image (first time only, ~10-15 min cold)
make dev             # start container + all services + dev server
make stop            # stop the container
```

Each worktree gets its own container name, node_modules volume, and auto-assigned port — multiple worktrees can run `make dev` simultaneously.

### Secrets management with Doppler

All environment variables are managed via **Doppler** (project configured in `doppler.yaml`).

`make dev` auto-downloads Doppler secrets (if the CLI is installed on the host) and passes them into the container. All `make` targets execute inside the container.

**When you add a new environment variable:**

1. Add the variable to Doppler:
   ```bash
   doppler secrets set MY_NEW_VAR="value"
   ```
2. Add it to `.env.example` with a comment explaining its purpose.
3. If the app reads it at runtime, add it to the Zod schema in `src/lib/env.ts`.
4. Verify the app still starts: `make stop && make dev`

Do NOT hardcode secrets in code or `.env.local`. Always use Doppler as the source of truth.

### Database

- PostgreSQL 16, database `app`
- `DATABASE_URL` from Doppler: `postgresql://postgres@localhost/app`
- `AUTH_DATABASE_URL` is auto-derived in `src/lib/env.ts` from `DATABASE_URL`
- Schema defined in `zenstack/schema.zmodel`

**Database schema separation:**
- `auth` schema: Better Auth tables. Accessed via `AUTH_DATABASE_URL` with `search_path=auth`
- `public` schema: App models (User, Organization, Membership). Accessed via `DATABASE_URL`
- These are SEPARATE schemas in the SAME PostgreSQL database. Do NOT mix them.

```bash
make codegen          # regenerate Prisma client after schema changes
make db-migrate-dev   # create a new migration (development only)
make db-migrate       # deploy pending migrations to DB
make db-migrate-status # check migration status
```

## Architecture

### Schema-Driven Flow

```
zenstack/schema.zmodel (Single Source of Truth)
  → ZenStack codegen → Prisma schema, TS types (models.ts, input.ts), runtime schema
  → Backend: RPC API at /api/model/[...path]/route.ts (auto-generated CRUD + policy enforcement)
  → Frontend: Type-safe TanStack Query hooks via useClientQueries(schema)
```

### Auth Flow

1. Sign up via Better Auth → session created in `auth` schema
2. Post-auth hook (`src/lib/provisioning.ts`) creates User, Organization, OWNER Membership in `public` schema
3. ZenStack policies enforce multi-tenant access at data layer

### Architecture Documentation (`docs/architecture/`)

Living Mermaid-in-Markdown diagrams generated from the codebase. Renders natively on GitHub and in VS Code.

| File | Diagram | Regenerate when changing |
|------|---------|--------------------------|
| `erd.md` | Entity Relationship Diagram | `zenstack/schema.zmodel` |
| `routes.md` | Route tree (pages + API) | `src/app/**/page.tsx`, `src/app/**/route.ts` |
| `modules.md` | Module dependency graph | `src/lib/`, `src/components/` structure |
| `auth-flow.md` | Auth + provisioning sequence | `src/lib/auth.ts`, `src/lib/provisioning.ts` |
| `system-overview.md` | High-level architecture | New external services or major changes |
| `README.md` | Index linking all diagrams | Any of the above |

**Regeneration:**
- Run `/generate-docs` to regenerate all diagrams, or `/generate-docs erd` for a specific one
- A PostToolUse hook (in `.claude/settings.json`) reminds to regenerate when editing `schema.zmodel`, `src/app/` routes/pages, or `src/lib/` modules

## Data Model (`zenstack/schema.zmodel`)

- **User**: `@id String` (matches Better Auth ID), email, memberships. `@@allow('read', auth() != null)`, `@@allow('update', auth().id == id)`
- **Organization**: cuid id, name, slug (unique), createdById → User, memberships[], projects[]. Read: members only. Update/delete: OWNER only.
- **Membership**: organizationId + userId (unique), role (OWNER|ADMIN|MEMBER). Read: org members. Manage: OWNER only.
- **Project**: name, description?, status (ACTIVE|PAUSED|ARCHIVED), organizationId, creatorId. Scoped to org membership.

Policy pattern: `@@allow('read', auth() != null && organization.memberships?[userId == auth().id])`

## Key Files

- `zenstack/schema.zmodel` — THE source of truth for data model
- `src/lib/db.ts` — ZenStack client, `bindDbAuth()`
- `src/lib/auth.ts` — Better Auth config with provisioning hook
- `src/lib/session.ts` — `getSession()`, `requireSession()`
- `src/lib/env.ts` — Validated env vars (Zod)
- `src/lib/provisioning.ts` — Post-signup workspace creation
- `src/lib/auth-context.ts` — `sessionToDbAuth()` converter
- `src/app/api/model/[...path]/route.ts` — ZenStack RPC handler
- `src/app/providers.tsx` — QueryClient + QuerySettingsProvider
- `src/components/ui/` — shadcn/ui primitives (copy-paste, NOT a library)
- `src/components/[domain]/` — Business logic (projects/, etc.)
- `src/lib/zenstack/generated/` — Auto-generated, NEVER edit manually
- `docs/architecture/` — Mermaid architecture diagrams (regenerate with `/generate-docs`)

## Code structure

- `src/app/` — Next.js App Router pages and API routes
- `src/lib/` — Shared utilities (auth, db, env)
- `src/components/` — React components (shadcn/ui based)
- `zenstack/` — ZenStack schema (data models + access policies)
- `tests/e2e/` — Playwright E2E tests
- `.claude/docker/` — Docker container configuration (Dockerfile, init scripts)
- `scripts/` — Setup and utility scripts

## Makefile (Primary Interface)

**Single container:** Most targets require the `ralphex-t3` container (started by `make dev` or by ralphex). Commands auto-detect the running container and execute inside it. Playwright auto-starts `yarn dev` on demand via its `webServer` config, so E2E tests work without `make dev`.

| Command | Description |
|---------|-------------|
| `make dev` | Start container + all services + dev server (auto-downloads Doppler secrets) |
| `make stop` | Stop and remove the container |
| `make logs` | Stream container logs |
| `make shell` | Interactive bash shell inside the container |
| `make codegen` | Regenerate ZenStack artifacts (**ALWAYS** after schema.zmodel changes) |
| `make db-migrate` | Deploy pending migrations to PostgreSQL (**ALWAYS** after schema.zmodel changes) |
| `make db-migrate-dev` | Create a new migration (development only, interactive terminal required) |
| `make db-migrate-status` | Check migration status (applied/pending) |
| `make lint` | ESLint |
| `make typecheck` | TypeScript type checking |
| `make build` | Production build |
| `make test-unit` | Vitest unit tests |
| `make test-e2e` | Playwright E2E tests (inside container; Playwright auto-starts dev server) |
| `make test-e2e-report` | Open Playwright HTML report in browser (runs on host) |
| `make test-e2e-review` | Run all E2E tests with full traces + open report (manual host-only, not for CI/ralphex) |
| `make db-seed` | Seed sample data |
| `make auth-generate` | Generate Better Auth migration SQL |
| `make auth-migrate` | Run Better Auth schema migrations |
| `make ralphex-build` | Build the ralphex-t3 Docker image |

## CRITICAL: After Modifying `schema.zmodel`

1. `make codegen` — regenerate TypeScript types AND Prisma schema
2. `make db-migrate-dev` — create a new migration (development only, interactive)
3. `make db-migrate` — deploy pending migrations to database
4. Generated files land in `src/lib/zenstack/generated/` (NEVER edit these manually)
5. `zenstack/migrations/` is committed to git — never delete or manually edit migration files

## Adding a New Entity (Standard Pattern)

1. Define model in `zenstack/schema.zmodel` with `@@allow` access policies
2. `make codegen && make db-migrate-dev && make db-migrate`
3. Create `src/components/[entity]/[entity]-view.tsx` using:
   - `useClientQueries(schema)` from `@zenstackhq/tanstack-query/react`
   - `schema` from `@/lib/zenstack/generated/schema-lite` (NOT `schema.ts`)
   - React Hook Form + zodResolver for create/edit forms
   - DataTable from `@/components/ui/data-table` for listings
4. Create/update page in `src/app/` passing `organizationId` + `userId` to the view
5. Write E2E test in `tests/e2e/[entity].spec.ts` covering full CRUD flow
6. Write unit tests for any utility/helper functions created

## Code Patterns

### Server Component (protected page)

```tsx
import { requireSession } from '@/lib/session';
import { sessionToDbAuth } from '@/lib/auth-context';
import { bindDbAuth } from '@/lib/db';

export default async function Page() {
  const session = await requireSession();
  const authContext = sessionToDbAuth(session);
  const authedDb = bindDbAuth(authContext);
  // fetch data, pass to client components
}
```

### Client Component (CRUD view)

```tsx
'use client';
import { useClientQueries } from '@zenstackhq/tanstack-query/react';
import { schema } from '@/lib/zenstack/generated/schema-lite';

export function EntityView({ organizationId, userId }: Props) {
  const client = useClientQueries(schema);
  const query = client.entity.useFindMany({ where: { organizationId } });
  const create = client.entity.useCreate();
  // React Hook Form + zodResolver for forms, DataTable for list
}
```

### Form Pattern

```tsx
const formSchema = z.object({ name: z.string().min(2) });
const form = useForm({ resolver: zodResolver(formSchema) });
// Use shadcn Label, Input, Button components
```

## Testing

### Unit Tests (Vitest)

- Co-located: `src/**/*.test.ts` (next to the file they test)
- Pattern: `describe`/`it`/`expect` from Vitest
- Run: `yarn test:unit` or `make test-unit`
- Reference: `src/lib/auth-context.test.ts`

### E2E Tests (Playwright)

- Location: `tests/e2e/*.spec.ts`
- Pattern: Full user-flow style, unique data with `crypto.randomUUID().slice(0, 8)`
- Run: `yarn test:e2e` or `make test-e2e`
- Shared helpers: `tests/e2e/helpers/` (e.g., `auth.ts` for sign-up flows)
- Reference: `tests/e2e/auth.spec.ts`

### Test Requirements

- Every new feature or bug fix MUST have corresponding tests
- No stub tests (`expect(true).toBe(true)`) — assert real behavior
- Cover happy path AND at least one error/edge case
- Unit tests: pure functions, utilities, helpers
- E2E tests: user flows, CRUD operations, auth flows

## Autonomous Execution (Ralphex)

For multi-task features (3+ steps), use ralphex instead of interactive sessions.
Each task runs in a fresh Claude Code subprocess — no context drift.

### Installation

- **Native (macOS):** `brew install umputun/apps/ralphex`
- **Docker wrapper:** install manually:
  `curl -sL https://raw.githubusercontent.com/umputun/ralphex/master/scripts/ralphex-dk.sh -o ~/.local/bin/ralphex-dk && chmod +x ~/.local/bin/ralphex-dk`
- **Custom Docker image (first time):** `make ralphex-build` — builds `ralphex-t3` with PostgreSQL, MinIO (S3), Doppler CLI, GitHub CLI, Playwright Chromium, and full dev toolchain for self-contained E2E testing

### Workflow

1. `/ralphex-plan [description]` — generates a structured plan in `docs/plans/`
2. Review the generated plan file
3. **Native:** `bin/ralphex docs/plans/[name].md`
4. **Docker sandboxed (recommended for unattended runs):** `bin/ralphex-dk docs/plans/[name].md`
   - Self-contained: PostgreSQL, MinIO (S3), Doppler CLI, GitHub CLI, Playwright Chromium — all run inside a single container
   - No external database, Docker socket, or host services needed
   - First run requires `make ralphex-build` to build the custom image
   - Set `DOPPLER_TOKEN` in host env for Doppler secrets (auto-passed by `bin/ralphex-dk`)
   - Set `GH_TOKEN` in host env for GitHub PR creation (auto-passed by `bin/ralphex-dk`)
5. **With web dashboard:** `bin/ralphex docs/plans/[name].md -s -p 8080`
6. All args pass through to ralphex as-is — see [usage docs](https://ralphex.com/docs/#usage)

### Automation

- **Auto-push:** Each task's commit is automatically pushed to the remote branch after completion. The finalize step also pushes with `--force-with-lease` after rebase.
- **PR creation is manual:** Run `/create-pr` when ready to create a pull request.
- If push fails (no remote, no auth), a warning is logged but the task/finalize step continues

### Orchestration (`/orchestrate`)

For large features that can be parallelized across multiple plans:

1. `/orchestrate [description]` — grill phase gathers deep context, decomposes work into a dependency graph
2. Generates N plan files + an execution manifest with wave order
3. Launches ralphex processes in parallel (each with `--worktree` for isolation)
4. Monitors progress, supports intervention (kill, edit plan, relaunch)
5. Final merge wave integrates all parallel branches via a dedicated ralphex plan
6. User runs `/create-pr` on the merged result

### Plan Files

Location: `docs/plans/YYYY-MM-DD-[name].md`
Format: `### Task N:` sections with `[ ]` checkboxes
Completed plans move to `docs/plans/completed/` automatically.

### Validation (runs automatically after every task)
`yarn lint && yarn typecheck && yarn test:unit` (configured in `.ralphex/prompts/task.txt`; `make` commands are not used inside the ralphex-dk container)

### Plan File Format

```markdown
# Feature: [Name]

## Overview
[Brief summary of the feature and what problem it solves]

## Context
[Technical context, dependencies, constraints]

### Task 1: Schema changes
- [ ] Add [Model] to zenstack/schema.zmodel with @@allow policies
- [ ] Run yarn db:generate && yarn db:migrate

### Task 2: Backend / server components
- [ ] Create server component with requireSession() chain
- [ ] Wire up data fetching via bindDbAuth()

### Task 3: Frontend view component
- [ ] Create src/components/[entity]/[entity]-view.tsx
- [ ] Use useClientQueries(schema) scoped by organizationId

### Task 4: Tests
- [ ] E2E tests in tests/e2e/[entity].spec.ts
- [ ] Unit tests co-located with utilities

### Task 5: Final E2E verification
- [ ] Run `yarn test:e2e` — all browser tests must pass
- [ ] Run `yarn test:unit && yarn typecheck && yarn lint`
```

## Environment variables reference

All vars are in Doppler. The canonical schema is in `src/lib/env.ts`.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `APP_URL` | yes | App base URL (e.g. `http://localhost:3000`) |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_DATABASE_URL` | no | Auto-derived from DATABASE_URL with auth schema search_path |
| `AUTH_SECRET` | yes | Secret for Better Auth session signing |
| `BETTER_AUTH_URL` | yes | Better Auth base URL |
| `PLAYWRIGHT_BASE_URL` | no | Base URL for E2E tests |
| `MINIO_ENDPOINT` | no | MinIO/S3 endpoint URL (e.g. `http://localhost:9000`) |
| `MINIO_ACCESS_KEY` | no | MinIO/S3 access key |
| `MINIO_SECRET_KEY` | no | MinIO/S3 secret key |
| `MINIO_BUCKET` | no | MinIO/S3 bucket name (default: `app-storage`) |
| `BLOB_READ_WRITE_TOKEN` | no | Vercel Blob token — when set, Vercel Blob is used instead of MinIO for file storage |
| `TEST_USER_EMAIL` | no | Test user email. TEST_* vars are in Doppler only, not in env.ts — access via `process.env` directly |
| `TEST_USER_PASSWORD` | no | Test user app login password |
| `TEST_USER_NAME` | no | Test user display name |
| `TRACE_ALL` | no | When set (e.g. `1`), capture Playwright traces for all tests, not just failures |
| `DOPPLER_TOKEN` | no | Doppler service token for secrets (required for ralphex-dk container) |
| `GH_TOKEN` | no | GitHub personal access token for PR creation (required for ralphex-dk container) |

## Critical Gotchas

1. Better Auth `auth` schema vs ZenStack `public` schema are SEPARATE. Never cross them.
2. ALWAYS `make codegen` then `make db-migrate-dev` (to create migration) then `make db-migrate` (to deploy) after `schema.zmodel` changes.
3. `proxy.ts` is OPTIMISTIC only. Real auth is in Server Components + ZenStack policies.
4. Always use `bindDbAuth()` — bypassing ZenStack bypasses policies.
5. Generated files in `src/lib/zenstack/generated/` are excluded from ESLint. Never edit them.
6. App requires Doppler-injected env vars. `src/lib/env.ts` validates at startup.
7. shadcn/ui components are COPIED into `src/components/ui/`, not installed as a package.
8. `zenstack/migrations/` is committed to git. Never delete migration files — they form an ordered history that must match the database state.
