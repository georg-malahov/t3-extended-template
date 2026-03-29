# Create Pull Request

Create a GitHub pull request for the current branch with a structured summary and test plan.

## Step 0: Verify Prerequisites

1. Check `gh` CLI is available: `which gh`
   - If not found, inform user and stop.

2. Check current branch is not main/master:
   - Run: `git branch --show-current`
   - If on main/master, inform user and stop.

3. Check there are commits ahead of the default branch:
   - Run: `git log main..HEAD --oneline`
   - If no commits, inform user and stop.

## Step 1: Gather Context

Run these in parallel:

1. `git log main..HEAD --oneline` — commit list
2. `git diff main...HEAD --stat` — changed files summary
3. Check if a plan file is referenced:
   - If `$ARGUMENTS` contains a plan file path, use that
   - Otherwise, check `docs/plans/` for a plan matching the current branch name
   - If no plan found, proceed without one

## Step 2: Build PR Content

**Title:**
- If plan file exists: extract from the first `# ` line (strip prefix), keep under 70 characters
- If no plan: derive from branch name and commit messages, keep under 70 characters

**Summary:**
- If plan file exists: extract the `## Overview` section
- If no plan: summarize the changes from commit messages and diff stat

**Test plan:**
Generate a SPECIFIC test plan based on the actual changes:
- Read the diff stat and commit messages to understand what was changed
- Write 3-6 checkbox items describing concrete verification steps
- Each item must be actionable (e.g., "Run make dev and verify the container starts with all services")
- Do NOT use generic items like "All unit tests pass" — those are enforced by CI
- Focus on manual verification, behavioral checks, and integration testing specific to the changes

## Step 3: Confirm with User

Present the PR title, summary, and test plan to the user. Use AskUserQuestion:
- header: "PR"
- question: "Create this pull request?"
- options:
  - "Create PR" — proceed
  - "Edit first" — let user modify before creating

If user wants to edit, ask what to change and update accordingly.

## Step 4: Create PR

```bash
gh pr create --title "<title>" --base main --body "$(cat <<'EOF'
## Summary
<summary>

## Changes
<commit list>

## Test plan
<test-plan>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL when done.

## Step 5: Clean Up Remote Branches (optional)

After PR creation, check if there are intermediate backup branches on GitHub from orchestrated runs.

1. List remote branches that were part of this orchestration:
   - Look at the execution manifest (`docs/plans/*-execution.md`) for branch names
   - Or check `git branch -r` for branches matching the plan names
2. If intermediate branches exist, ask the user:
   - header: "Cleanup"
   - question: "Delete intermediate remote branches from GitHub?"
   - options:
     - "Delete all" — remove all intermediate backup branches from remote
     - "Keep them" — leave as-is
3. If user approves, delete each: `git push origin --delete <branch-name>`
4. Local branches and worktrees are NOT deleted here — they are managed by ralphex and git

## Constraints

- Always confirm with user before creating PR and before deleting remote branches
- Never create a PR against a branch with failing validation
- If the branch has not been pushed, push it first: `git push origin HEAD -u`
- If `gh pr create` fails with a TLS/certificate error, retry with `dangerouslyDisableSandbox: true` — the sandbox network restrictions can block GitHub API calls
