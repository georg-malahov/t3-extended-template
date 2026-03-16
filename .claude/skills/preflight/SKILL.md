---
name: preflight
description: Run all quality checks before committing. Lint, typecheck, and unit tests in sequence. Stops on first failure.
disable-model-invocation: true
---

# Pre-commit Quality Checks

Run all quality gates in sequence. Stop on first failure, fix, and retry.

## Step 1: Lint

```bash
yarn lint
```

If errors found:
- Fix the lint issues in the source files
- Re-run `yarn lint` to confirm fixes

Note: Generated files in `src/lib/zenstack/generated/` are excluded from ESLint.

## Step 2: Type Check

```bash
yarn typecheck
```

If errors found:
- If errors reference generated types, run `make codegen` first, then re-check
- Fix type issues in source files
- Re-run `yarn typecheck` to confirm

## Step 3: Unit Tests

```bash
yarn test:unit
```

If failures found:
- Investigate failing test(s)
- Fix the code or the test as appropriate
- Re-run `yarn test:unit` to confirm

## Summary

Report results:
- Lint: pass/fail (error count)
- Typecheck: pass/fail
- Unit tests: pass/fail (test count)

All three must pass before committing.
