# T3 Extended SaaS Template - Claude Code Context

## Overview

This is a production-ready, greenfield SaaS template built on modern TypeScript infrastructure. It provides a complete foundation for building multi-tenant B2B applications with authentication, authorization, CRUD operations, testing, and deployment infrastructure pre-configured.

**Key Philosophy**: Schema-driven development with end-to-end type safety, from database models through API routes to frontend React components.

## Tech Stack

### Core Framework
- **Next.js 16.1** (App Router, React Server Components, TypeScript strict mode)
- **React 19.2** with Server Components and Actions
- **TypeScript 5.9** (strict mode enabled)
- **yarn 1.22.22** (package manager)

### Data & Auth Layer
- **ZenStack v3** - Schema-first ORM with declarative access policies, generates:
  - Prisma-compatible schema
  - Type-safe RPC API routes
  - Frontend TanStack Query hooks
  - All from a single `.zmodel` source
- **Better Auth 1.5** - Modern auth library with PostgreSQL adapter
- **PostgreSQL 16** - Primary database for both auth and application data
- **Kysely** - Type-safe SQL query builder (used by Better Auth)

### Frontend
- **shadcn/ui** - Open-source component collection (NOT a library, copy-paste approach)
- **Radix UI** - Unstyled, accessible component primitives
- **Tailwind CSS 4.2** - Utility-first styling
- **TanStack Query 5.90** - Server state management, automatically generated hooks
- **TanStack Table 8.21** - Headless table/datagrid
- **React Hook Form 7.71** - Form state management
- **Zod 4.3** - Schema validation
- **next-themes** - Theme management (dark/light mode)
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

### Testing
- **Vitest 4.0** - Unit and integration tests
- **Playwright 1.58** - End-to-end tests
- **Testing Library** - React component testing utilities

### DevOps & Infrastructure
- **Docker** - Containerization and local development
- **Docker Compose** - Multi-service orchestration
- **Doppler** - Secrets and environment variable management
- **GitHub Actions** - CI/CD pipelines
- **Coolify** - Deployment platform with native PR preview support
- **Hetzner** - Recommended hosting provider

## Architecture

### Schema-Driven Data Flow

```
zenstack/schema.zmodel (Single Source of Truth)
    ↓
ZenStack Code Generation
    ↓
┌─────────────────────────────────────────────────┐
│ Generated Artifacts:                            │
│ - Prisma Schema                                 │
│ - TypeScript Types (models.ts, input.ts)       │
│ - Runtime Schema (schema.ts)                    │
│ - Lite Schema (schema-lite.ts)                  │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ Backend: RPC API Routes                         │
│ /api/model/[...path]/route.ts                   │
│ - Auto-generated CRUD operations                │
│ - Policy enforcement at data layer              │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ Frontend: Type-Safe Hooks                       │
│ useProject(), useOrganization(), etc.           │
│ - Auto-generated TanStack Query hooks           │
│ - End-to-end type safety                        │
└─────────────────────────────────────────────────┘
```

### Database Schema Separation

**Critical Design Decision**: Better Auth and ZenStack use different PostgreSQL schemas in the SAME database:

- **`auth` schema** - Better Auth tables (user, session, verification, etc.)
  - Accessed via `AUTH_DATABASE_URL` with `search_path=auth`
- **`public` schema** - Application models (User, Organization, Membership, Project)
  - Accessed via `DATABASE_URL` (default schema)

This separation prevents table ownership conflicts while maintaining a single PostgreSQL instance.

### Authentication Flow

1. User signs up via Better Auth (`/api/auth/[...all]/route.ts`)
2. Better Auth creates session in `auth` schema
3. Post-auth hook (`src/lib/provisioning.ts`) provisions:
   - Application User record (public schema)
   - Default Organization
   - OWNER Membership
4. Subsequent requests use session for authorization
5. ZenStack policies enforce multi-tenant data access

## Data Model

### Core Entities

**User** (`src/lib/zenstack/generated/models.ts`)
- Synchronized with Better Auth session
- Created via post-signup provisioning hook
- ID matches Better Auth user ID
- Access: Users can read all users, update only themselves

**Organization**
- Multi-tenant container
- Each org has a unique slug
- Policies enforce member-only access
- Only OWNER can update/delete

**Membership**
- Junction table: User ↔ Organization
- Roles: OWNER, ADMIN, MEMBER (enum)
- Unique constraint on (organizationId, userId)
- Only OWNER can manage memberships

**Project** (Example Business Entity)
- Belongs to one Organization
- Scoped by organization membership
- Members can read, OWNER/ADMIN can modify
- Demonstrates tenant-scoped CRUD pattern

### Access Control Patterns

ZenStack policies in `zenstack/schema.zmodel` use declarative rules:

```zmodel
@@allow('read', auth() != null && organization.memberships?[userId == auth().id])
```

These compile to runtime checks enforced at the data layer, not in route handlers.

## File Structure

```
/
├── .cursor/plans/                    # Cursor IDE planning artifacts
├── .github/workflows/                # CI/CD pipelines
│   ├── ci.yml                        # Lint, type-check, unit tests, build
│   └── e2e.yml                       # Playwright E2E tests
├── scripts/                          # Utility scripts
│   └── seed.ts                       # Database seeding
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/
│   │   │   ├── auth/[...all]/        # Better Auth catch-all route
│   │   │   └── model/[...path]/      # ZenStack RPC API
│   │   ├── dashboard/                # Protected dashboard
│   │   ├── sign-in/                  # Auth pages
│   │   ├── sign-up/
│   │   ├── layout.tsx                # Root layout (providers, fonts)
│   │   ├── page.tsx                  # Landing page
│   │   └── providers.tsx             # React Query, theme providers
│   ├── components/
│   │   ├── auth/                     # Auth-specific components
│   │   ├── layout/                   # Shell, header, nav components
│   │   ├── projects/                 # Business logic components
│   │   └── ui/                       # shadcn/ui components (copied)
│   ├── lib/
│   │   ├── auth.ts                   # Better Auth server config
│   │   ├── auth-client.ts            # Better Auth client
│   │   ├── auth-context.ts           # Auth state management
│   │   ├── db.ts                     # Database client factory
│   │   ├── env.ts                    # Validated environment variables
│   │   ├── provisioning.ts           # Post-signup user provisioning
│   │   ├── session.ts                # Session helpers
│   │   ├── utils.ts                  # Utility functions (cn, etc.)
│   │   └── zenstack/generated/       # Auto-generated ZenStack artifacts
│   │       ├── schema.ts             # Runtime schema
│   │       ├── schema-lite.ts        # Frontend-safe schema
│   │       ├── models.ts             # TypeScript types
│   │       └── input.ts              # Input validation types
│   └── test/
│       └── setup.ts                  # Vitest configuration
├── tests/e2e/                        # Playwright tests
├── zenstack/
│   └── schema.zmodel                 # SINGLE SOURCE OF TRUTH for data model
├── docker-compose.yml                # Local development stack
├── Dockerfile                        # Production image
├── Makefile                          # Task runner (primary interface)
├── next.config.ts                    # Next.js configuration
├── playwright.config.ts              # E2E test configuration
├── vitest.config.mts                 # Unit test configuration
├── doppler.yaml                      # Doppler CLI configuration
├── proxy.ts                          # Middleware for auth redirects
└── package.json                      # Dependencies and scripts
```

## Development Workflow

### Prerequisites
- Node 20.19.0+ (see `.nvmrc`)
- yarn 1.22.22
- Docker Desktop or Engine
- Doppler CLI (`brew install dopplerhq/cli/doppler`)

### First-Time Setup

1. **Configure Doppler**:
   ```bash
   doppler login
   doppler setup
   # Select project and config (typically 'dev')
   ```

2. **Required Environment Variables** (in Doppler `dev` config):
   ```
   APP_URL=http://localhost:3000
   BETTER_AUTH_URL=http://localhost:3000/api/auth
   AUTH_SECRET=<generate-random-32-char-string>
   DATABASE_URL=postgresql://postgres:postgres@db:5432/app
   AUTH_DATABASE_URL=postgresql://postgres:postgres@db:5432/app?search_path=auth
   PLAYWRIGHT_BASE_URL=http://localhost:3000
   DOPPLER_PROJECT=<your-project>
   DOPPLER_CONFIG=dev
   ```

3. **Start Local Stack**:
   ```bash
   make dev
   ```

   This single command:
   - Starts PostgreSQL 16 container
   - Builds and starts Next.js app container
   - Runs `yarn install`
   - Generates ZenStack artifacts
   - Migrates Better Auth schema
   - Pushes ZenStack schema to DB
   - Starts Next.js dev server

### Makefile Targets (Primary Interface)

**Development**:
- `make dev` - Docker-based local development (recommended)
- `make dev-local` - Native Node.js development (no Docker)

**Code Generation**:
- `make codegen` - Regenerate ZenStack TypeScript artifacts
- `make auth-migrate` - Apply Better Auth schema migrations

**Database**:
- `make db-push` - Push ZenStack schema to PostgreSQL
- `make db-seed` - Seed database with sample data

**Quality**:
- `make lint` - ESLint
- `make typecheck` - TypeScript type checking
- `make build` - Production build
- `make test-unit` - Vitest unit tests
- `make test-e2e` - Playwright E2E tests

### Code Generation Workflow

**CRITICAL**: After modifying `zenstack/schema.zmodel`:

```bash
make codegen    # Regenerate TypeScript types
make db-push    # Push schema changes to DB
```

ZenStack generates:
- Prisma schema (in memory, not committed)
- TypeScript types (`models.ts`, `input.ts`)
- Runtime schemas (`schema.ts`, `schema-lite.ts`)
- TanStack Query hooks (consumed via `@zenstackhq/tanstack-query`)

### Adding New Features

**Pattern for New Entity**:

1. **Define in ZenStack Schema** (`zenstack/schema.zmodel`):
   ```zmodel
   model Task {
     id             String @id @default(cuid())
     title          String
     organizationId String
     organization   Organization @relation(fields: [organizationId], references: [id])

     @@allow('read', organization.memberships?[userId == auth().id])
     @@allow('create', organization.memberships?[userId == auth().id])
   }
   ```

2. **Regenerate**:
   ```bash
   make codegen
   make db-push
   ```

3. **Use in Frontend** (`src/components/tasks/tasks-view.tsx`):
   ```typescript
   import { useTask } from '@zenstackhq/tanstack-query/runtime';

   function TasksView({ orgId }: { orgId: string }) {
     const { data: tasks } = useTask().useFindMany({
       where: { organizationId: orgId },
       orderBy: { createdAt: 'desc' }
     });
     // ...
   }
   ```

No API route code needed - the RPC endpoint is auto-generated.

## Testing Strategy

### Unit Tests (Vitest)

- **Location**: Co-located with source files (`*.test.ts`, `*.test.tsx`)
- **Focus**: Pure functions, utilities, client-side logic
- **Example**: `src/lib/auth-context.test.ts`
- **Run**: `make test-unit` or `yarn test:unit`

### E2E Tests (Playwright)

- **Location**: `tests/e2e/`
- **Focus**: User flows across multiple pages
- **Example**: `tests/e2e/auth-and-projects.spec.ts`
  - Sign up flow
  - Sign in flow
  - Protected route access
  - Project CRUD operations
- **Run**: `make test-e2e` or `yarn test:e2e`

**Note**: Next.js guidance recommends Playwright for async Server Component testing rather than unit tests.

### Test Database

E2E tests use a separate `test` Doppler config with isolated DATABASE_URL.

## Deployment

### Coolify Configuration

**Production App**:
- Type: Application (not Docker Compose)
- Build Pack: Dockerfile
- PostgreSQL: Dedicated resource/service
- Doppler: `prod` config via `DOPPLER_TOKEN` secret

**Preview Deployments**:
- Enable native PR preview via Coolify GitHub App
- Wildcard preview domain (e.g., `*.preview.yourapp.com`)
- Doppler: `preview` config (separate secrets from prod)
- PostgreSQL: Dedicated preview database resource
- Auto-deploy on PR creation
- Auto-cleanup on PR merge/close

### Environment Variables by Environment

| Variable | dev | test | ci | preview | prod |
|----------|-----|------|----|---------|----- |
| APP_URL | localhost:3000 | localhost:3000 | CI-specific | preview.domain | production.domain |
| DATABASE_URL | Docker service | Test DB | CI service | Preview DB | Production DB |
| AUTH_SECRET | dev-secret | test-secret | CI-secret | preview-secret | prod-secret |

**Managed via Doppler configs**: `dev`, `test`, `ci`, `preview`, `prod`

### CI/CD Pipelines

**`.github/workflows/ci.yml`**:
- Triggers: Push, Pull Request
- Steps:
  1. Checkout code
  2. Install Doppler CLI
  3. `doppler run -- yarn install`
  4. `doppler run -- yarn db:generate`
  5. `doppler run -- yarn typecheck`
  6. `doppler run -- yarn lint`
  7. `doppler run -- yarn test:unit`
  8. `doppler run -- yarn build`
- Secrets: `DOPPLER_TOKEN` (scoped to `ci` config)

**`.github/workflows/e2e.yml`**:
- Triggers: Pull Request
- PostgreSQL service container
- Playwright browsers installed
- Full E2E suite against test database

## Key Patterns & Conventions

### Component Organization

- **`/components/ui`** - Primitive shadcn components (button, input, table, etc.)
- **`/components/layout`** - Shell, navigation, header components
- **`/components/auth`** - Authentication-specific UI
- **`/components/[domain]`** - Business logic components (projects, tasks, etc.)

### Form Pattern

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
});

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  // Use with shadcn form components
}
```

### Server Component Pattern

```typescript
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  // Server-side data fetching
  return <ClientComponent userId={session.user.id} />;
}
```

### Client Component + TanStack Query

```typescript
'use client';

import { useProject } from '@zenstackhq/tanstack-query/runtime';

export function ProjectsList({ orgId }: { orgId: string }) {
  const { data, isLoading } = useProject().useFindMany({
    where: { organizationId: orgId },
  });

  // Automatically type-safe, auto-generated hook
}
```

### Table Pattern (TanStack Table)

See `src/components/ui/data-table.tsx` for reusable DataTable component.

```typescript
const columns: ColumnDef<Project>[] = [
  { accessorKey: 'name', header: 'Name' },
  // ...
];

<DataTable columns={columns} data={projects} />
```

## Important Gotchas

### 1. Schema Separation
- Better Auth uses `auth` schema, app models use `public` schema
- Forgetting `search_path=auth` in `AUTH_DATABASE_URL` causes table conflicts
- The application User model and Better Auth user table are SEPARATE

### 2. Code Generation Dependencies
- Always run `make codegen` after schema changes
- Always run `make db-push` to sync database
- TanStack Query hooks won't reflect changes until codegen runs
- Missing step = type errors or runtime failures

### 3. Authentication vs Authorization
- `proxy.ts` provides OPTIMISTIC redirects only
- Real auth checks happen in Server Components and ZenStack policies
- Never rely solely on client-side auth state

### 4. Policy Enforcement
- ZenStack policies are evaluated at data access time
- Bypassing the ZenStack enhanced client bypasses policies
- Always use `getEnhancedPrisma(userId)` in server code

### 5. Doppler Required
- App will NOT start without Doppler-injected env vars
- `src/lib/env.ts` validates all required variables at startup
- Fail-fast approach prevents runtime config bugs

### 6. Docker-First Development
- `make dev` is recommended over native Node.js
- Ensures PostgreSQL, app, and network are configured identically across machines
- `make dev-local` exists but requires manual PostgreSQL setup

### 7. Coolify Preview Limitations
- Don't bundle DB + app in Docker Compose for previews
- Use separate PostgreSQL resource/service
- Container name coupling causes issues (see Coolify docs)

## Extending the Template

### Adding shadcn/ui Components

```bash
npx shadcn@latest add [component-name]
```

Components are copied to `src/components/ui/`, not installed as dependencies.

### Adding Authentication Providers

Better Auth supports OAuth providers. Update `src/lib/auth.ts`:

```typescript
import { github } from 'better-auth/social-providers';

export const auth = betterAuth({
  // ...
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
});
```

### Multi-Tenant Best Practices

1. Always scope queries by organizationId
2. Enforce access in ZenStack policies, not application code
3. Use `organization.memberships?[userId == auth().id]` pattern
4. Never expose cross-tenant data, even in error messages

## Common Tasks

### Reset Local Database

```bash
docker compose down -v  # Delete volume
make dev                # Rebuilds from scratch
```

### Add New Environment Variable

1. Add to Doppler config
2. Add to `src/lib/env.ts` validation
3. Restart app

### Debug Session Issues

```typescript
import { getSession } from '@/lib/session';

const session = await getSession();
console.log(session);
```

Session stored in Better Auth `session` table (`auth` schema).

### Seed Database

```bash
make db-seed
```

Seeds one project for the first user found. Customize `scripts/seed.ts`.

## Performance Considerations

- Server Components fetch data server-side (no waterfalls)
- TanStack Query caches client-side queries
- ZenStack policies add overhead - profile if querying large datasets
- Use `lite` schema in frontend to avoid sending policies to client

## Security Notes

- Environment secrets in Doppler, never in code
- ZenStack policies prevent unauthorized access at data layer
- Better Auth handles password hashing, session management
- CSRF protection enabled by default in Better Auth
- Use `AUTH_SECRET` for signing tokens (rotate periodically)

## Migration Path

This template is designed to be forked and customized:

1. Clone the repo
2. Update `package.json` name
3. Replace `Project` entity with your domain model
4. Customize auth flow (add OAuth, 2FA, etc.)
5. Update branding, theme, and UI components

The schema-driven approach means domain changes happen primarily in `zenstack/schema.zmodel`, not scattered across routes and components.

## Resources

- [Next.js 16 Docs](https://nextjs.org/docs)
- [ZenStack v3 Docs](https://zenstack.dev/docs)
- [Better Auth Docs](https://www.better-auth.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)
- [TanStack Query Docs](https://tanstack.com/query)
- [Coolify Docs](https://coolify.io/docs)
- [Doppler Docs](https://docs.doppler.com)

## Support & Contributions

This template is a starting point. Modify freely for your use case. The architectural decisions (schema-driven, Doppler-based env, Docker-first) are intentional but not mandatory.

For questions about specific technologies, refer to their respective documentation linked above.
