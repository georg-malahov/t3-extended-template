# T3 Extended SaaS Template

Multi-tenant SaaS template. Schema-driven development with end-to-end type safety.

## Tech Stack

- Next.js 16.1 (App Router, RSC), React 19.2, TypeScript 5.9 (strict), yarn 1.22.22
- ZenStack v3 (schema-first ORM, generates Prisma schema + TS types + TanStack Query hooks)
- Better Auth 1.5 (PostgreSQL adapter), PostgreSQL 16, Kysely
- shadcn/ui, Radix UI, Tailwind CSS 4.2, TanStack Query 5.90, TanStack Table 8.21
- React Hook Form 7.71, Zod 4.3, next-themes, Lucide React, Sonner
- Vitest 4.0, Playwright 1.58, Docker, Doppler (env management)

## Architecture

### Schema-Driven Flow

```
zenstack/schema.zmodel (Single Source of Truth)
  → ZenStack codegen → Prisma schema, TS types (models.ts, input.ts), runtime schema
  → Backend: RPC API at /api/model/[...path]/route.ts (auto-generated CRUD + policy enforcement)
  → Frontend: Type-safe TanStack Query hooks via useClientQueries(schema)
```

### Database Schema Separation

- `auth` schema: Better Auth tables. Accessed via `AUTH_DATABASE_URL` with `search_path=auth`
- `public` schema: App models (User, Organization, Membership, Project). Accessed via `DATABASE_URL`
- These are SEPARATE schemas in the SAME PostgreSQL database. Do NOT mix them.

### Auth Flow

1. Sign up via Better Auth → session created in `auth` schema
2. Post-auth hook (`src/lib/provisioning.ts`) creates User, Organization, OWNER Membership in `public` schema
3. ZenStack policies enforce multi-tenant access at data layer

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

## Makefile (Primary Interface)

- `make dev` — Docker-based dev (recommended)
- `make dev-local` — Native Node.js dev
- `make codegen` — Regenerate ZenStack artifacts (**ALWAYS** after schema.zmodel changes)
- `make db-push` — Push schema to PostgreSQL (**ALWAYS** after schema.zmodel changes)
- `make lint` — ESLint
- `make typecheck` — TypeScript type checking
- `make build` — Production build
- `make test-unit` — Vitest unit tests
- `make test-e2e` — Playwright E2E tests
- `make db-seed` — Seed sample data

## CRITICAL: After Modifying `schema.zmodel`

1. `make codegen` — regenerate TypeScript types
2. `make db-push` — sync database
3. Generated files land in `src/lib/zenstack/generated/` (NEVER edit these manually)

## Adding a New Entity (Standard Pattern)

1. Define model in `zenstack/schema.zmodel` with `@@allow` access policies
2. `make codegen && make db-push`
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
- Pattern: Full user-flow style, unique data with `Date.now()`
- Run: `yarn test:e2e` or `make test-e2e`
- Shared helpers: `tests/e2e/helpers/` (e.g., `auth.ts` for sign-up flows)
- Reference: `tests/e2e/auth.spec.ts`, `tests/e2e/projects.spec.ts`

### Test Requirements

- Every new feature or bug fix MUST have corresponding tests
- No stub tests (`expect(true).toBe(true)`) — assert real behavior
- Cover happy path AND at least one error/edge case
- Unit tests: pure functions, utilities, helpers
- E2E tests: user flows, CRUD operations, auth flows

## Autonomous Execution (Ralphex)

For multi-task features (3+ steps), use ralphex instead of interactive sessions.
Each task runs in a fresh Claude Code subprocess — no context drift.

### Workflow

1. `/ralphex-plan [description]` — generates a structured plan in `docs/plans/`
2. Review the generated plan file
3. `/ralphex docs/plans/[name].md` — executes plan, auto-commits after each task
4. **Docker sandboxed (recommended for unattended runs):**
   `bash .claude/scripts/ralphex-dk.sh docs/plans/[name].md`

### Plan Files

Location: `docs/plans/YYYY-MM-DD-[name].md`
Format: `### Task N:` sections with `[ ]` checkboxes
Completed plans move to `docs/plans/completed/` automatically.

### Validation (runs automatically after every task)
`make lint && make typecheck && make test-unit` (configured in `.ralphex/config`)

### Plan File Format

```markdown
# Feature: [Name]

## Context
[Why this feature, what problem it solves]

### Task 1: Schema changes
- [ ] Add [Model] to zenstack/schema.zmodel with @@allow policies
- [ ] Run make codegen && make db-push

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
- [ ] Run `make test-e2e` — all browser tests must pass
- [ ] Run `make test-unit && make typecheck && make lint`
```

## Critical Gotchas

1. Better Auth `auth` schema vs ZenStack `public` schema are SEPARATE. Never cross them.
2. ALWAYS `make codegen` then `make db-push` after `schema.zmodel` changes.
3. `proxy.ts` is OPTIMISTIC only. Real auth is in Server Components + ZenStack policies.
4. Always use `bindDbAuth()`/`getEnhancedPrisma()` — bypassing ZenStack bypasses policies.
5. Generated files in `src/lib/zenstack/generated/` are excluded from ESLint. Never edit them.
6. App requires Doppler-injected env vars. `src/lib/env.ts` validates at startup.
7. shadcn/ui components are COPIED into `src/components/ui/`, not installed as a package.
