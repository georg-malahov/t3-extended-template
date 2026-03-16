# Project CRUD E2E Test Coverage

## Overview

Extend Playwright E2E test coverage for the project management feature. The existing
`auth-and-projects.spec.ts` covers the happy path in a single combined test. This plan
adds a dedicated `projects.spec.ts` with full CRUD coverage including edit, status
transitions, validation errors, and multi-project scenarios.

## Context

- Existing E2E: `tests/e2e/auth-and-projects.spec.ts` — sign-up + basic project create/pause/delete
- Projects UI: `src/components/projects/` — ProjectsView, forms, table
- Projects page: `src/app/dashboard/page.tsx` (or similar)
- Pattern: unique data with `Date.now()`, full user-flow style, `make test-e2e` to run

## Development Approach

- Testing approach: tests only — no production code changes
- Each test is independent: sign up a fresh user per `describe` block
- Tests cover both happy path and error/edge cases

## Implementation Steps

### Task 1: Scaffold test file with shared auth helper
- [ ] Create `tests/e2e/projects.spec.ts`
- [ ] Add `signUpAndGoToDashboard(page)` helper that signs up a unique user and lands on dashboard
- [ ] Add smoke test: dashboard renders project creation form after sign-up
- [ ] Run `make test-e2e` — must pass before task 2

### Task 2: Create project — happy path and validation
- [ ] Test: create project with name + description → appears in list with ACTIVE status
- [ ] Test: create project with name only (no description) → appears in list
- [ ] Test: submit empty form → validation error shown, no project created
- [ ] Test: create project with name < 2 chars → validation error shown
- [ ] Run `make test-e2e` — must pass before task 3

### Task 3: Status transitions
- [ ] Test: ACTIVE → pause button → status becomes PAUSED
- [ ] Test: PAUSED → resume/activate button → status becomes ACTIVE
- [ ] Test: ACTIVE → archive (if supported) → status becomes ARCHIVED
- [ ] Run `make test-e2e` — must pass before task 4

### Task 4: Delete and list behaviour
- [ ] Test: delete project → removed from list, no other projects affected
- [ ] Test: create 3 projects → all appear in list
- [ ] Test: delete one of 3 → remaining 2 still visible
- [ ] Run `make test-e2e` — must pass before task 5

### Task 5: Final E2E verification
- [ ] Run full `make test-e2e` — all tests including `auth-and-projects.spec.ts` must pass
- [ ] Run `make test-unit` — no regressions
- [ ] Run `make typecheck && make lint`
