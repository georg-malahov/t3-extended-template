# Plan: Claude Code Agent Infrastructure for T3 SaaS Template

## Context

The project is a production-ready T3 SaaS template with schema-driven development (ZenStack), but has zero Claude Code agent infrastructure configured — no custom agents, skills, hooks, or optimized CLAUDE.md. The goal is to set up a first-iteration "AI team" that enables effective end-to-end feature development with vibe coding, following Claude Code best practices for agents, sub-agents, skills, and hooks. Testing is a mandatory first-class concern — every feature and bug fix must be covered with real, meaningful tests. Not overengineered — extensible later.

## What We're Creating

| File | Purpose |
|------|---------|
| `CLAUDE.md` | **Rewrite** — trim from 613 to ~180 lines, keep only what agents need during coding |
| `.claude/settings.json` | Project-level permissions + lint-on-save hook (committed to git) |
| `.claude/agents/reviewer.md` | Code review subagent (includes test quality validation) |
| `.claude/agents/schema-planner.md` | ZenStack data model design subagent |
| `.claude/agents/tester.md` | Testing subagent — writes and runs unit + E2E tests |
| `.claude/skills/add-feature/SKILL.md` | End-to-end entity scaffold workflow (includes mandatory test step) |
| `.claude/skills/add-component/SKILL.md` | shadcn/ui component installer |
| `.claude/skills/preflight/SKILL.md` | Pre-commit quality gates (lint + typecheck + tests with coverage) |
| `.claude/hooks/lint-on-save.sh` | Auto-lint after file edits |
| `.gitignore` | Add `.claude/settings.local.json` |

**Total: 3 subagents, 3 skills, 1 hook, optimized CLAUDE.md, settings.json = 10 files**

---

## Step 1: Rewrite `CLAUDE.md` (~180 lines)

**Remove** (not needed during coding): Prerequisites, first-time setup, Doppler config details, deployment/Coolify sections, CI/CD pipeline details (already in `.github/workflows/`), env var table (already in `src/lib/env.ts`), Docker rationale, extending the template, common tasks, performance notes, security notes, migration path, resources, support.

**Keep** (condensed): Tech stack (flat list), schema-driven flow diagram, DB schema separation, auth flow, data model summary with policy patterns, key files list, commands, critical codegen workflow, new entity pattern, code patterns (server component, client component, form), testing patterns (unit + E2E), critical gotchas, testing commands.

**Reference patterns from actual code:**
- Server component: `requireSession()` → `sessionToDbAuth(session)` → `bindDbAuth(authContext)` (from `src/app/dashboard/page.tsx`)
- Client component: `useClientQueries(schema)` with `schema` from `schema-lite` (from `src/components/projects/projects-view.tsx`)
- Form: `useForm` + `zodResolver` + shadcn `Input`/`Label`/`Button` (from `projects-view.tsx`)
- Unit test: Vitest `describe`/`it`/`expect`, co-located `*.test.ts` (from `src/lib/auth-context.test.ts`)
- E2E test: Playwright `test`/`expect`, user-flow style, unique test data with `Date.now()` (from `tests/e2e/auth-and-projects.spec.ts`)

---

## Step 2: Create `.claude/settings.json`

Project-level settings (committed to git):
- **Permissions**: Allow `bun run *`, `npx shadcn@latest *`, `git *`, core read/write tools
- **Deny**: `rm -rf /`, `docker compose down -v`
- **Hook**: `PostToolUse` on `Edit|Write` → runs `.claude/hooks/lint-on-save.sh`

---

## Step 3: Create `.claude/hooks/lint-on-save.sh`

Shell script that:
1. Reads `PostToolUse` JSON from stdin, extracts `file_path`
2. Skips non-TS files and `zenstack/generated/` files
3. Runs `bun run lint` on the project
4. Surfaces errors to stderr so Claude sees them immediately

---

## Step 4: Create `.claude/agents/reviewer.md`

**Purpose**: Code review subagent, delegated after implementing features or before commits.

**Model**: `sonnet` (fast, cost-effective for review)
**Tools**: `Read, Grep, Glob, Bash`

**Checks**:
1. Schema alignment — new models have proper `@@allow` policies with `organization.memberships?[userId == auth().id]`
2. Type safety — uses ZenStack generated types, not manual definitions
3. Auth patterns — server components use `requireSession()` + `bindDbAuth(sessionToDbAuth(session))`; client components use `useClientQueries(schema)` from `schema-lite`
4. Component conventions — business components in `src/components/[domain]/`, forms use RHF + zodResolver, lists use DataTable
5. Multi-tenancy — all queries scoped by `organizationId`
6. Generated files — nobody edited `src/lib/zenstack/generated/`
7. **Test quality** — every changed/added module has corresponding test(s). Tests must:
   - Assert real behavior, not just "expect(true).toBe(true)" stubs
   - Cover happy path AND at least one error/edge case
   - Use meaningful assertions (check return values, DOM state, or side effects)
   - Not mock away the thing being tested
   - E2E tests follow user-flow pattern with real interactions (like `auth-and-projects.spec.ts`)

**Output**: Categorized findings (Critical / Warning / Suggestion)

---

## Step 5: Create `.claude/agents/schema-planner.md`

**Purpose**: Designs ZenStack schema models with access policies for new entities.

**Model**: `inherit` (uses whatever the session is using)
**Tools**: `Read, Grep, Glob`

**Behavior**: Reads `zenstack/schema.zmodel`, proposes new model with fields, relations, `@@allow` policies following existing patterns. Outputs a complete model block ready to paste.

**Constraints enforced**: cuid IDs, timestamps, `onDelete: Cascade`, organization scoping, role-based policies.

---

## Step 6: Create `.claude/agents/tester.md`

**Purpose**: Writes and runs both unit tests (Vitest) and E2E tests (Playwright) for new features and bug fixes.

**Model**: `sonnet` (fast, good at pattern-following)
**Tools**: `Read, Grep, Glob, Bash, Edit, Write`

**Behavior**:
1. Reads the code being tested to understand its behavior
2. Reads existing test files to match project conventions:
   - **Unit tests**: Co-located `*.test.ts` files, Vitest `describe`/`it`/`expect`, pattern from `src/lib/auth-context.test.ts`
   - **E2E tests**: `tests/e2e/*.spec.ts`, Playwright `test`/`expect`, user-flow pattern from `tests/e2e/auth-and-projects.spec.ts`
3. Writes tests following strict quality rules:
   - **No stubs**: Every test must assert real behavior with meaningful expectations
   - **No `expect(true)`**: Tests must check actual return values, DOM elements, API responses
   - **Edge cases**: Include at least one error path or boundary condition per test suite
   - **Isolation**: Unit tests must not depend on database or network; E2E tests use unique data (`Date.now()` suffixes)
   - **Readability**: Test names describe the behavior being verified
4. Runs the tests: `bun run test:unit` for unit, `bun run test:e2e` for E2E
5. If tests fail, analyzes failures and fixes them
6. Reports coverage summary

**Test decision guide**:
- Pure functions, utilities, helpers → unit test (co-located `*.test.ts`)
- React components with complex logic → unit test with Testing Library
- User flows across pages (auth, CRUD, navigation) → Playwright E2E test
- ZenStack policy enforcement → E2E test (needs real DB)

---

## Step 7: Create `.claude/skills/add-feature/SKILL.md`

**Invocation**: `/add-feature [entity-name]`

**Workflow**:
1. Read `zenstack/schema.zmodel` for patterns
2. Design and add new model with access policies
3. Run `bun run db:generate && bun run db:migrate`
4. Create `src/components/[entity]/[entity]-view.tsx` following `projects-view.tsx` pattern exactly (uses `useClientQueries(schema)`, RHF, DataTable, toast)
5. Create/update dashboard page following `src/app/dashboard/page.tsx` pattern
6. **Write unit tests** for any utility/helper functions created
7. **Write E2E test** in `tests/e2e/[entity].spec.ts` following the `auth-and-projects.spec.ts` pattern — test the full CRUD flow: create, read, update status, delete
8. Run `bun run typecheck && bun run lint`
9. Run `bun run test:unit` to verify unit tests pass
10. Report what was created and test results

---

## Step 8: Create `.claude/skills/add-component/SKILL.md`

**Invocation**: `/add-component [name]`

Simple workflow: `npx shadcn@latest add $ARGUMENTS`, verify file exists, check dependencies, run typecheck.

---

## Step 9: Create `.claude/skills/preflight/SKILL.md`

**Invocation**: `/preflight`

Sequential quality gates — stop on first failure, fix, retry:
1. `bun run lint` — fix lint errors
2. `bun run typecheck` — fix type errors (run `bun run db:generate` first if generated type issues)
3. `bun run test:unit` — run unit tests, fix failures
4. Report summary with pass/fail counts

---

## Step 10: Update `.gitignore`

Add `.claude/settings.local.json` (personal/local settings should not be committed).
Ensure `.claude/plans/` is NOT gitignored — plans should be committed to the repo for history and reference.

---

## Step 11: Configure plans directory

Ensure `.claude/plans/` directory exists in the project and is tracked by git. Session plans will be stored here and committed to the repo, providing a history of architectural decisions and implementation plans.

Add an empty `.claude/plans/.gitkeep` to ensure the directory is tracked even when empty.

---

## Verification

After creating all files:
1. `ls -la .claude/agents/` — should show `reviewer.md`, `schema-planner.md`, `tester.md`
2. `ls -la .claude/skills/` — should show `add-feature/`, `add-component/`, `preflight/` directories
3. `ls -la .claude/hooks/` — should show `lint-on-save.sh` (executable)
4. `wc -l CLAUDE.md` — should be under 200 lines
5. `cat .claude/settings.json | jq .` — valid JSON
6. Start a new Claude Code session and verify:
   - `/add-feature`, `/add-component`, `/preflight` appear as available skills
   - The `reviewer`, `schema-planner`, and `tester` agents are available for delegation
