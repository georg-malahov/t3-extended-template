# Extend E2E Test Coverage for CRUD Operations

## Overview

Split the monolithic e2e test into focused test files with shared auth helpers. Add coverage for sign-in, project CRUD edge cases, status transitions, form validation, and data table rendering.

## Context

- Files involved: `tests/e2e/auth-and-projects.spec.ts`, `playwright.config.ts`, `src/components/projects/projects-view.tsx`
- Related patterns: Playwright test style with `Date.now()` unique data, direct page interaction
- Dependencies: Playwright 1.58, running dev server

## Development Approach

- **Testing approach**: Regular (write tests directly)
- Complete each task fully before moving to the next
- **CRITICAL: every task MUST include new/updated tests**
- **CRITICAL: all tests must pass before starting next task**

## Implementation Steps

### Task 1: Create shared auth helper and refactor existing test

**Files:**
- Create: `tests/e2e/helpers/auth.ts`
- Modify: `tests/e2e/auth-and-projects.spec.ts`

- [x] Create `tests/e2e/helpers/auth.ts` with a `signUpAndLogin(page)` helper that performs sign-up with a unique email and navigates to dashboard, returning `{ email, name }`
- [x] Refactor `auth-and-projects.spec.ts` to use the shared helper
- [x] Run `make test-e2e` - must pass before task 2

### Task 2: Add auth flow tests

**Files:**
- Create: `tests/e2e/auth.spec.ts`

- [x] Test: sign-up creates account and redirects to dashboard with workspace visible
- [x] Test: sign-in with existing credentials reaches dashboard
- [x] Test: sign-in with wrong password shows error
- [x] Test: unauthenticated user visiting /dashboard is redirected to sign-in
- [x] Run `make test-e2e` - must pass before task 3

### Task 3: Add comprehensive project CRUD tests

**Files:**
- Create: `tests/e2e/projects.spec.ts`

- [x] Test: create project with name and description, verify it appears in the data table
- [x] Test: create project with name only (no description), verify "No description" shown
- [x] Test: toggle project status ACTIVE -> PAUSED -> ACTIVE, verify status badge updates
- [x] Test: delete project and verify it is removed from the table
- [x] Test: create multiple projects and verify they all appear in the table ordered by newest first
- [x] Run `make test-e2e` - must pass before task 4

### Task 4: Add form validation and edge case tests

**Files:**
- Modify: `tests/e2e/projects.spec.ts`

- [x] Test: submitting create form with empty name shows validation error (name min 2 chars)
- [x] Test: submitting create form with 1-character name shows validation error
- [x] Test: create button shows "Creating..." loading state during submission (use request interception to slow the request)
- [x] Run `make test-e2e` - must pass before task 5

### Task 5: Verify acceptance criteria

- [x] Run `make test-e2e` - all browser tests must pass
- [x] Run `make test-unit && make typecheck && make lint`
- [x] Verify test count increased from 1 to 10+ distinct test cases
