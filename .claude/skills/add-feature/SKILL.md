---
name: add-feature
description: End-to-end feature scaffold from ZenStack schema to frontend view with tests. Use when adding a new entity or domain feature.
disable-model-invocation: true
argument-hint: "[entity-name] - e.g., Task, Invoice, Comment"
---

# Add Feature: $ARGUMENTS

Scaffold a complete new entity feature end-to-end.

## Step 1: Schema Design

Read `zenstack/schema.zmodel` to understand existing patterns (User, Organization, Membership, Project).

Design the new model following these rules:
- Belongs to Organization via `organizationId` foreign key
- Has `@@allow` policies using `organization.memberships?[userId == auth().id]`
- Uses `@id @default(cuid())`, `createdAt @default(now())`, `updatedAt @updatedAt`
- Uses `onDelete: Cascade` on the organization relation
- Includes `creatorId` field linking to User with a named relation
- Add relation fields to Organization and User models

Add the model to `zenstack/schema.zmodel`.

## Step 2: Code Generation

Run:
```bash
bun run db:generate && bun run db:migrate
```

If errors occur, fix the schema and retry.

## Step 3: Frontend View Component

Create `src/components/[entity]/[entity]-view.tsx` following the exact pattern in `src/components/projects/projects-view.tsx`:

- `'use client'` directive
- Import `useClientQueries` from `@zenstackhq/tanstack-query/react`
- Import `schema` from `@/lib/zenstack/generated/schema-lite`
- Define Zod form schema with validation
- Use `useForm` with `zodResolver`
- Use `client.[entity].useFindMany`, `useCreate`, `useUpdate`, `useDelete`
- Define `ColumnDef` array for DataTable
- Create form with shadcn Card, CardHeader, CardTitle, CardContent, Input, Label, Button
- Use DataTable from `@/components/ui/data-table` for listing
- Toast notifications via `sonner` for success/error on mutations
- Accept `organizationId` and `userId` as props

## Step 4: Dashboard Integration

Create a new page or update `src/app/dashboard/page.tsx` following the exact pattern:

```tsx
import { requireSession } from '@/lib/session';
import { sessionToDbAuth } from '@/lib/auth-context';
import { bindDbAuth } from '@/lib/db';
```

- Use `requireSession()` for auth
- Use `bindDbAuth(sessionToDbAuth(session))` for server-side queries
- Pass `organizationId` and `userId` to the view component

## Step 5: Write Tests

### E2E Test
Create `tests/e2e/[entity].spec.ts` following `tests/e2e/auth-and-projects.spec.ts`:
- Sign up with unique email using `Date.now()`
- Navigate to the entity page
- Create an entity via the form
- Verify it appears in the list
- Update its status
- Delete it
- Verify it's gone

### Unit Tests
For any utility/helper functions created, add co-located `*.test.ts` files following `src/lib/auth-context.test.ts` pattern:
- Test happy path with valid input
- Test edge case with invalid/missing input
- Use `describe`/`it`/`expect` from Vitest

## Step 6: Verify

Run all quality checks:
```bash
bun run typecheck && bun run lint && bun run test:unit
```

Report what was created and test results.
