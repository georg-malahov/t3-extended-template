# CLAUDE.md — Project conventions for AI agents

## Project overview

T3 Extended SaaS Template — multi-tenant SaaS starter. Schema-driven development with end-to-end type safety.

**Tech Stack:** Next.js 16.1 (App Router, RSC), React 19.2, TypeScript 5.9 (strict), Bun 1.x,
ZenStack v3 (schema-first ORM → Prisma + TS types + TanStack Query hooks),
Better Auth 1.5 (PostgreSQL adapter), PostgreSQL 16, Kysely,
shadcn/ui, Radix UI, Tailwind CSS 4.2, TanStack Query 5.90, TanStack Table 8.21,
React Hook Form 7.71, Zod 4.3, next-themes, Lucide React, Sonner,
Vitest 4.0, Playwright 1.58, Docker, Doppler (env management).

## Environment setup

Development uses a single `t3-template-ralphex` Docker container that includes PostgreSQL 16, MinIO (S3), Doppler CLI, GitHub CLI, Bun, and Playwright Chromium. No host-native setup required beyond Docker.

```bash
bun run image:build  # build the image (first time only, ~10-15 min cold)
bun run up           # start container + all services + dev server
bun run down         # stop the container
```

Each worktree gets its own container name, node_modules volume, and auto-assigned port — multiple worktrees can run `bun run up` simultaneously.

### Remote-control Claude Code sessions

`bun run remote-control` boots a throwaway `t3-template-ralphex` container whose only job is to run `claude remote-control`, so the current repo is reachable from claude.ai/code and the Claude mobile app. Mounts, credentials, and Doppler/GH tokens are reused from the same ralphex-dk machinery as `bin/ralphex-dk`.

**Commands.**

| Command | What it does |
|---------|-------------|
| `bun run remote-control` | Fresh throwaway container: start detached, tail logs until the `claude.ai/code?environment=...` URL appears, print it, return. Container runs in the background. Fail-fast if one is already running. |
| `bun run remote-control --stop` | `docker stop` the container. Because `--rm` is on by default, Docker auto-removes it and everything inside the writable layer is gone. |
| `bun run remote-control --logs` | `docker logs -f` the running container. |

**Design: completely stateless.** Every invocation is a fresh container. Every `--stop` destroys it. The only persistent surface is `/workspace` → host repo, which is already bind-mounted — so files you create during the session survive. Anything else (claude session JSONL history, shell snapshots, caches) is ephemeral and goes away with the container. If you want to preserve conversation context across restarts, **summarize it into a file under `/workspace`** before stopping; you can re-feed it into the next session as a starting prompt. There is currently no "resume the previous bridge URL" mechanism — the `claude remote-control` CLI has no `--resume` flag, and spawned bridge sessions always start fresh.

**Container name.** Deterministic: `t3-remote-<worktree>`, where `<worktree>` is the sanitized repo folder name. So multiple worktrees each get their own remote-control session, and the outer (parent) claude session running outside the container can always target the child by name.

**Three non-obvious things the script does to make Remote Control work inside Docker at all.** If you ever touch this, know that each of these was discovered the hard way:

1. **Stages a patched `~/.claude.json` in `$TMPDIR`** and mounts it to `/home/app/.claude/.claude.json`. Claude Remote Control reads `accountUuid` / `organizationUuid` / `claudeMaxTier` from that file (not from `.credentials.json`) and without it aborts with *"Unable to determine your organization for Remote Control eligibility."* The staged copy also injects a `projects["/workspace"].hasTrustDialogAccepted = true` entry, because workspace trust is keyed on absolute cwd and the container cwd (`/workspace`) differs from the host repo path — without the injection, claude refuses with *"Workspace not trusted."* Using a staged copy (rather than bind-mounting the real host file) prevents the container from mutating user host state.
2. **Runs `docker run -dt`** — detached **with** pseudo-TTY. Without `-t`, claude's bridge handshake times out after 15 s during `POST /v1/environments/bridge` because the remote-control UI rendering path waits on TTY I/O primitives.
3. **Passes `--spawn same-dir`** to `claude remote-control`. Without it, the CLI blocks on an interactive `1=same-dir / 2=worktree` prompt that has no stdin to read from, and the container hangs without printing the session URL.

**Where session content lives (and what happens on stop).** The child's full conversation is persisted inside the container at `/home/app/.claude/projects/-workspace/<uuid>.jsonl` plus `subagents/*.jsonl` and `tool-results/*.txt`. None of those paths are bind-mounted, so `docker stop` + auto-remove wipes them. The parent (outer) claude session never sees this content unless it explicitly `docker exec`s into the container while it's alive — tailing `docker logs` only exposes bridge UI (spinner, connection status, URL), not prompts or responses.

**Typical split-brain workflow.** Run `claude remote-control` on the host as the **parent**, without `GH_TOKEN`. From that parent, run `bun run remote-control` to spawn a **child** inside the container for unrestricted code work. When the child finishes, come back to the parent to push / open a PR — only the parent holds the GH credentials. The child runs with `--permission-mode bypassPermissions` (unrestricted) and inherits `DOPPLER_TOKEN` / `GH_TOKEN` from the caller only if they are set in the host env — same policy as `bin/ralphex-dk`.

### Secrets management with Doppler

All environment variables are managed via **Doppler** (project configured in `doppler.yaml`).

`bun run up` auto-downloads Doppler secrets (if the CLI is installed on the host) and passes them into the container.

**When you add a new environment variable:**

1. Add the variable to Doppler:
   ```bash
   doppler secrets set MY_NEW_VAR="value"
   ```
2. Add it to `.env.example` with a comment explaining its purpose.
3. If the app reads it at runtime, add it to the Zod schema in `src/lib/env.ts`.
4. Verify the app still starts: `bun run down && bun run up`

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
bun run dx bun run db:generate     # regenerate Prisma client after schema changes
bun run dx bun run db:migrate:dev  # create a new migration (development only)
bun run dx bun run db:migrate      # deploy pending migrations to DB
bun run dx bun run db:migrate:status # check migration status
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

## Commands

**Docker lifecycle** — managed via TypeScript scripts in `scripts/`:

| Command | Description |
|---------|-------------|
| `bun run up` | Start container + all services + dev server (auto-downloads Doppler secrets) |
| `bun run down` | Stop and remove the container |
| `bun run logs` | Stream container logs |
| `bun run dx bash` | Interactive bash shell inside the container |
| `bun run dx <cmd>` | Run any command inside the container |
| `bun run image:build` | Build the t3-template-ralphex Docker image |
| `bun run remote-control` | Spin up the ralphex image as a detached Claude Code remote-control session; see "Remote-control Claude Code sessions" above |

**Direct commands** — run on host or inside container:

| Command | Description |
|---------|-------------|
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript type checking |
| `bun run build` | Production build |
| `bun run test:unit` | Vitest unit tests |
| `bun run test:e2e` | Playwright E2E tests (Playwright auto-starts dev server) |
| `bun run test:e2e:report` | Open Playwright HTML report in browser |
| `bun run db:generate` | Regenerate ZenStack artifacts (**ALWAYS** after schema.zmodel changes) |
| `bun run db:migrate` | Deploy pending migrations to PostgreSQL |
| `bun run db:migrate:dev` | Create a new migration (development only, interactive) |
| `bun run db:migrate:status` | Check migration status |
| `bun run db:seed` | Seed sample data |
| `bun run auth:generate` | Generate Better Auth migration SQL |
| `bun run auth:migrate` | Run Better Auth schema migrations |

To run commands inside the container: `bun run dx bun run <script>` (e.g., `bun run dx bun run test:e2e`)

## CRITICAL: After Modifying `schema.zmodel`

1. `bun run db:generate` — regenerate TypeScript types AND Prisma schema
2. `bun run db:migrate:dev` — create a new migration (development only, interactive)
3. `bun run db:migrate` — deploy pending migrations to database
4. Generated files land in `src/lib/zenstack/generated/` (NEVER edit these manually)
5. `zenstack/migrations/` is committed to git — never delete or manually edit migration files

## Adding a New Entity (Standard Pattern)

1. Define model in `zenstack/schema.zmodel` with `@@allow` access policies
2. `bun run db:generate && bun run db:migrate:dev && bun run db:migrate`
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
- Run: `bun run test:unit`
- Reference: `src/lib/auth-context.test.ts`

### E2E Tests (Playwright)

- Location: `tests/e2e/*.spec.ts`
- Pattern: Full user-flow style, unique data with `crypto.randomUUID().slice(0, 8)`
- Run: `bun run test:e2e`
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
- **Custom Docker image (first time):** `bun run image:build` — builds `t3-template-ralphex` with PostgreSQL, MinIO (S3), Doppler CLI, GitHub CLI, Playwright Chromium, and full dev toolchain for self-contained E2E testing

### Workflow

1. `/ralphex-plan [description]` — generates a structured plan in `docs/plans/`
2. Review the generated plan file
3. **Native:** `bin/ralphex docs/plans/[name].md`
4. **Docker sandboxed (recommended for unattended runs):** `bin/ralphex-dk docs/plans/[name].md`
   - Self-contained: PostgreSQL, MinIO (S3), Doppler CLI, GitHub CLI, Playwright Chromium — all run inside a single container
   - No external database, Docker socket, or host services needed
   - First run requires `bun run image:build` to build the custom image
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
`bun run lint && bun run typecheck && bun run test:unit` (configured in `.ralphex/prompts/task.txt`)

### Plan File Format

```markdown
# Feature: [Name]

## Overview
[Brief summary of the feature and what problem it solves]

## Context
[Technical context, dependencies, constraints]

### Task 1: Schema changes
- [ ] Add [Model] to zenstack/schema.zmodel with @@allow policies
- [ ] Run bun run db:generate && bun run db:migrate

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
- [ ] Run `bun run test:e2e` — all browser tests must pass
- [ ] Run `bun run test:unit && bun run typecheck && bun run lint`
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
2. ALWAYS `bun run db:generate` then `bun run db:migrate:dev` (to create migration) then `bun run db:migrate` (to deploy) after `schema.zmodel` changes.
3. `proxy.ts` is OPTIMISTIC only. Real auth is in Server Components + ZenStack policies.
4. Always use `bindDbAuth()` — bypassing ZenStack bypasses policies.
5. Generated files in `src/lib/zenstack/generated/` are excluded from ESLint. Never edit them.
6. App requires Doppler-injected env vars. `src/lib/env.ts` validates at startup.
7. shadcn/ui components are COPIED into `src/components/ui/`, not installed as a package.
8. `zenstack/migrations/` is committed to git. Never delete migration files — they form an ordered history that must match the database state.
