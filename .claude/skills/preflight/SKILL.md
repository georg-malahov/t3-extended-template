---
name: preflight
description: Run all quality checks before committing. Lint, typecheck, and unit tests in sequence. Stops on first failure.
disable-model-invocation: true
---

# Pre-commit Quality Checks

Run all quality gates in sequence. Stop on first failure, fix, and retry.

## Step 1: Lint

```bash
bun run lint
```

If errors found:
- Fix the lint issues in the source files
- Re-run `bun run lint` to confirm fixes

Note: Generated files in `src/lib/zenstack/generated/` are excluded from ESLint.

## Step 2: Type Check

```bash
bun run typecheck
```

If errors found:
- If errors reference generated types, run `bun run db:generate` first, then re-check
- Fix type issues in source files
- Re-run `bun run typecheck` to confirm

## Step 3: Unit Tests

```bash
bun run test:unit
```

If failures found:
- Investigate failing test(s)
- Fix the code or the test as appropriate
- Re-run `bun run test:unit` to confirm

## Summary

Report results:
- Lint: pass/fail (error count)
- Typecheck: pass/fail
- Unit tests: pass/fail (test count)

All three must pass before committing.
