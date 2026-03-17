---
name: add-package
description: Add a yarn package dependency to the project.
disable-model-invocation: true
argument-hint: "[package-name] - e.g., zod, lodash, or -D eslint-plugin-foo"
---

# Add Package: $ARGUMENTS

## Step 1: Install

Run:
```bash
yarn add $ARGUMENTS
```

Use `-D` flag for dev dependencies (e.g., `/add-package -D @types/foo`).

## Step 2: Verify

Confirm the package appears in `package.json` under `dependencies` or `devDependencies`.

## Step 3: Type Check

Run:
```bash
yarn typecheck
```

Fix any type errors introduced by the new package.

Report what was added and whether it was a dev or production dependency.
