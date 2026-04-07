---
name: add-component
description: Add a shadcn/ui component to the project. Components are copied into src/components/ui/.
disable-model-invocation: true
argument-hint: "[component-name] - e.g., dialog, dropdown-menu, tabs"
---

# Add shadcn/ui Component: $ARGUMENTS

## Step 1: Install

Run:
```bash
npx shadcn@latest add $ARGUMENTS
```

This copies the component into `src/components/ui/`.

## Step 2: Verify

Check that the component file exists:
- `src/components/ui/$ARGUMENTS.tsx`

If the component has dependencies on other ui/ components (check imports), ensure those are also installed.

## Step 3: Type Check

Run:
```bash
bun run typecheck
```

Fix any type errors if they arise.

Report what was added and its location.
