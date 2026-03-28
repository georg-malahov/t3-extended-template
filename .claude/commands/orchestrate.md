# Orchestrate — Parallel Plan Generation and Execution

Create and execute multiple ralphex plans in parallel, respecting dependency order.

## Step 0: Parse Intent and Gather Context

**Resume detection:** Before starting fresh, check if there is an active orchestration to resume.
Scan `docs/plans/*-execution.md` for any manifest with `Current State:` that is NOT
`not_started` or `completed`. If found, skip to **Step 4.5 (Resume)** instead of starting over.
Also trigger resume if the user says "resume", "continue orchestration", or similar.

1. **Parse user's description** to understand the high-level goal.

2. **Launch Explore agent** to gather relevant codebase context:
   - Existing models, routes, components related to the goal
   - Patterns and conventions already established
   - Files and modules that will be affected
   - Current state of any related work (check `docs/plans/` for related plans)

3. **Synthesize findings** into a context summary. Present it to the user before proceeding.

## Step 1: Grill — Deep Context Gathering

Interview the user relentlessly about every aspect of the work until reaching shared understanding.
This is the most critical phase — the quality of plans depends entirely on context gathered here.

**How to grill:**
- Ask questions **one at a time** using AskUserQuestion
- For each question, provide your **recommended answer** as the first option
- Walk down each branch of the decision tree, resolving dependencies one-by-one
- If a question can be answered by exploring the codebase, **explore instead of asking**
- Challenge assumptions — ask "why" and "what if"
- Focus on questions that reveal parallelism opportunities:
  - What are the distinct entities, services, and UI surfaces involved?
  - Which parts share data or state? Which are independent?
  - Are there shared UI containers (layouts, navigation) that multiple features plug into?
  - What is the minimum viable integration point between parallel tracks?
  - Are there sequence constraints (e.g., schema must exist before UI)?

**Keep grilling until you can answer:**
1. What are all the distinct work streams?
2. For each pair of work streams: does one depend on the other, or are they independent?
3. What shared resources (schema, layouts, navigation, services) must exist before parallel work begins?
4. What integration points need a merge step afterward?

When you have enough context, summarize your understanding and ask the user to confirm before proceeding to decomposition.

## Step 2: Decompose — Build the Dependency Graph

Analyze the work streams identified in Step 1 and organize them into waves:

1. **Identify the foundation** — shared work that everything else depends on (schema changes, navigation shell, shared services). This is always Wave 1 and runs as a single plan if it can't be parallelized.

2. **Identify independent tracks** — work streams that don't depend on each other after the foundation is in place. These form parallel plans in Wave 2.

3. **Identify sequential dependencies** — work that must follow a specific track. These go into later waves.

4. **Always add a final merge wave** — a plan that:
   - Integrates results from parallel tracks (resolves conflicts if branches touched adjacent code)
   - Runs full validation (`make lint && make typecheck && make test-unit && make test-e2e`)
   - Ensures coherence across all changes
   - Updates documentation (`/generate-docs` equivalent tasks)

**Present the DAG to the user:**

```
Wave 1 (sequential): [foundation plan]
Wave 2 (parallel):   [plan-a] | [plan-b] | [plan-c]
Wave 3 (parallel):   [plan-d] | [plan-e]  (depends on wave 2)
Wave N (merge):       [merge-validation]
```

Use AskUserQuestion to confirm the decomposition before generating plans.

## Step 2.5: Validate — Review Plan Size, Parallelism, and Mocks

After the user confirms the initial decomposition, perform a critical validation pass:

### Size and manageability check
For each plan in the DAG, count the number of tasks and assess their complexity:
- **Ideal**: 3-6 tasks per plan, each completable in a single ralphex iteration
- **Too large**: Plans with 7+ tasks or tasks that combine multiple concerns (e.g., "build service + UI + API + tests") should be split
- **Too small**: Plans with 1-2 tasks can be merged with related plans

### Parallelism maximization with mocks
Challenge every dependency between plans. Ask: "Can this dependency be eliminated with a mock or interface contract?"

**Principle:** Since all plans are well-defined with known inputs/outputs, parallel plans can use **mocks and stubs** for components built by sibling plans. The merge plan then replaces mocks with real implementations.

Examples:
- A plan building a tab component doesn't need the workspace shell — it can render standalone or use a mock wrapper
- A plan building a service doesn't need the UI — it can be tested with unit tests against the real DB
- A plan building UI doesn't need the real service — it can mock API responses matching the planned contract

When a plan uses mocks for parallel siblings, document them explicitly in the plan:
```markdown
### Mocks (removed during merge)
- `src/components/fall/fall-arbeitsbereich-mock.tsx` — mock workspace shell for standalone tab testing
- Mock API response for `/api/termin/availability` — returns static slot data
```

The merge plan MUST include a task to:
1. Remove all mock files
2. Replace mock imports with real implementations
3. Verify no mock references remain (`grep -r "mock" src/`)

### Present the validated structure
Present the validated plan structure to the user with task counts and mock strategy.
Use AskUserQuestion to confirm before generating plans.

## Step 3: Generate Plans

For each work stream, write a plan file in `docs/plans/YYYY-MM-DD-<name>.md`.

**Use parallel Agent instances** to generate independent plans simultaneously. Each agent receives:
- The full context summary from Step 1
- The specific scope for its work stream
- Awareness of what other parallel plans are doing (to avoid conflicts)
- Dependencies: which plans must complete before this one starts

**Each plan follows the exact ralphex-plan format:**

```markdown
# [Plan Title]

## Overview
[What this plan delivers and why]

## Context
[Full context from Step 1, scoped to this work stream]
[Dependencies: list which plans must complete before this one]
[Parallel awareness: what other plans are running alongside, what they touch]

## Development Approach
- Testing approach: [TDD / Regular]
- CRITICAL: every task MUST include tests
- CRITICAL: all tests must pass before starting next task
- CRITICAL: update this plan file when scope changes

## Testing Strategy
- Unit tests: required for every task
- E2E tests: required for UI changes

## Progress Tracking
- Mark completed items with [x]
- Add newly discovered tasks with + prefix
- Document issues/blockers with warning prefix

## Implementation Steps

### Task 1: [specific name]
- [ ] [specific action with file reference]
- [ ] write tests
- [ ] run tests — must pass before next task

### Task N-1: Verify acceptance criteria
- [ ] verify all requirements implemented
- [ ] run full test suite
- [ ] run linter

### Task N: Update documentation
- [ ] update relevant docs
```

**Additionally, write the execution manifest** at `docs/plans/YYYY-MM-DD-<feature>-execution.md`.

The execution manifest serves two purposes:
1. **Context document** — records all grill-phase decisions so parallel ralphex processes have full context
2. **Persistent state file** — tracks orchestration progress across session interruptions (pause/resume)

```markdown
# Execution Manifest: [Feature Name]

## Overview
[One paragraph summary of the full feature]

## Context Gathered
[Key decisions and context from the grill phase — this is the shared knowledge base]

## Dependency Graph

Wave 1 (foundation): docs/plans/YYYY-MM-DD-<name>.md
Wave 2 (parallel):
  - docs/plans/YYYY-MM-DD-<name-a>.md
  - docs/plans/YYYY-MM-DD-<name-b>.md
Wave N (merge): docs/plans/YYYY-MM-DD-<name>-merge.md

## Execution Log

_Updated during execution. This section is the persistent state that enables pause/resume
across sessions. A new session reads this to know exactly where to pick up._

### Current State: [not_started | wave_N_running | wave_N_paused | completed]

### Wave 1 — [not_started | started YYYY-MM-DDTHH:MM | completed]
| Plan | Branch | Status | Notes |
|------|--------|--------|-------|
| plan-name | worktree-plan-name | pending/running/paused/completed/failed | |

### Wave 2 — [not_started | started YYYY-MM-DDTHH:MM | completed]
| Plan | Branch | Status | Notes |
|------|--------|--------|-------|
```

After generating all plans, present a summary of what was created and confirm with the user.

## Step 4: Execute — Launch and Monitor

### 4.1: Launch Current Wave

**Isolation: create worktrees on the HOST, run ralphex-dk from each worktree.**

Git worktrees use absolute paths in their references. They must be created on the host — never
inside Docker (container-internal paths break after the container stops). `ralphex-dk` automatically
mounts `$(pwd)` as `/workspace` and the main `.git` directory at its host path, so git operations
inside the container resolve correctly.

For each plan in the current wave:

1. Create a host-side worktree and branch:
```bash
git worktree add .ralphex/worktrees/<plan-stem> -b worktree-<plan-stem>
```

2. **Copy plan files into the worktree.** Plan files are written to the parent worktree's
   `docs/plans/` during Step 3, but worktrees branch from the parent's HEAD at the time of
   creation — which is BEFORE the plan files were committed. Without this copy, ralphex will
   fail with "plan file not found":
```bash
cp docs/plans/<plan-file>.md .ralphex/worktrees/<plan-stem>/docs/plans/<plan-file>.md
```

3. Run `bin/ralphex-dk` from the worktree directory:
```bash
cd .ralphex/worktrees/<plan-stem> && bin/ralphex-dk --max-iterations 50 --wait 1h docs/plans/<plan-file>.md
```
The `--wait 1h` flag is critical for parallel runs: when a rate limit is hit, ralphex waits and
retries instead of exiting. This is configured in `.ralphex/config` via `wait_on_limit` but the
CLI flag ensures it even if config is not picked up.

Each worktree has the full repo structure including `bin/ralphex-dk`. Running from the worktree
directory makes `ralphex-dk` mount that worktree (not the main repo) as `/workspace`. Each
container gets its own isolated file tree — no shared mount conflicts, no `--worktree` flag needed.

**Branch strategy:** All work happens on local branches. Pushes to GitHub are backup only — the merge
plan works with local branches via `git merge`, never fetches from remote to get parallel track results.

Run each via Bash tool with `run_in_background: true`. Record task IDs and branch names.

**Determine progress filenames** for each:
- `.ralphex/progress/progress-{plan-stem}.txt`

**Update the execution manifest** after launching each wave (this is the persistent state file):

```markdown
## Execution Log

### Wave 1 — started 2026-03-26T14:00
| Plan | Branch | Status | PID |
|------|--------|--------|-----|
| 04a-schema | worktree-04a-schema | running | 12345 |

### Wave 2 — started 2026-03-26T15:30
| Plan | Branch | Status | PID |
|------|--------|--------|-----|
| 04b-nav-layout | worktree-04b-nav-layout | completed | — |
| 05a-communication | worktree-05a-communication | running | 23456 |
| 05b-documents | worktree-05b-documents | running | 34567 |
```

Update plan statuses as they complete: `running` → `completed` or `failed`.
This state survives session interruptions — a new session can read it and resume.

Report launch status:

```
Launched wave N:
  [plan-a] — task_id: X, progress: .ralphex/progress/progress-plan-a.txt
  [plan-b] — task_id: Y, progress: .ralphex/progress/progress-plan-b.txt

Monitoring progress. Ask "check orchestrate" for status.
Commands: "pause" to stop all processes, "resume" to continue.
```

### 4.2: Monitor Progress (on user request or periodically)

When user asks "check orchestrate", "status", or similar:

1. For each running plan, read last 30 lines of its progress file
2. Check TaskOutput with `block: false` for each task ID
3. Report status per plan:
   - Current task number and description
   - Phase (task execution / review / finalize)
   - Any warnings or failures detected

**Proactive intervention signals** (flag these to user):
- Progress file shows repeated failures on same task
- `TASK_FAILED` appears in progress
- No progress for extended period (same content on consecutive checks)
- Plan appears to be going off-track (implementation doesn't match intent)

**If intervention needed:**
1. Suggest killing the process and editing the plan
2. On user approval: kill the process, edit the plan file with corrective instructions
3. Relaunch ralphex on the same plan — it picks up from the first unchecked task

### 4.3: Wave Transition

When all plans in a wave complete (TaskOutput shows exit for all):

1. Report results for each plan
2. If any failed: ask user whether to fix and retry, skip, or abort
3. If all succeeded: **merge completed wave branches into the parent branch** so the next wave starts from an up-to-date base:
   ```bash
   # From the parent worktree directory:
   git merge worktree-<plan-stem-1> worktree-<plan-stem-2> ...
   ```
   This is critical: the parent session runs in a worktree (via `claude --worktree`). Child
   worktrees branch from the parent's HEAD. Without merging wave results back into the parent,
   the next wave's worktrees would miss the previous wave's changes (e.g., Wave 2 plans
   would not have Wave 1's schema changes).

   For single-plan waves (e.g., Wave 1 schema): simple `git merge worktree-04a-schema`.
   For multi-plan waves: octopus merge or sequential merges. Resolve conflicts if any.
4. Announce next wave and ask to proceed
5. Launch next wave (return to 4.1)

### 4.4: Pause

When the user says "pause", "stop", or similar:

1. **Kill all running ralphex processes:**
   ```bash
   # Find and kill ralphex-dk containers for this orchestration
   docker ps --filter "name=ralphex" --format "{{.Names}}" | xargs -r docker stop
   ```
   Ralphex saves progress via task checkboxes in the plan file after each completed task,
   so killing mid-run loses at most the currently executing task (it will be retried on resume).

2. **Update the execution manifest** — set running plans to `paused`:
   ```markdown
   | 05a-communication | worktree-05a-communication | paused | — |
   ```

3. **Commit the execution manifest** so state is preserved even if the worktree is disrupted:
   ```bash
   git add docs/plans/**/execution-manifest.md && git commit -m "orchestrate: pause at wave N"
   ```

4. Confirm to the user: "Orchestration paused at Wave N. Resume anytime with `/orchestrate resume`
   or by saying 'resume orchestration' in a new session."

### 4.5: Resume

When the user says "resume", "continue", or runs `/orchestrate resume`, OR when starting a new
session and the user asks to continue orchestration:

1. **Find the execution manifest** — scan `docs/plans/**/execution-manifest.md` for the active orchestration.

2. **Read the execution log** to determine current state:
   - Which wave is active?
   - Which plans are `completed`, `paused`, or `failed`?

3. **For each incomplete plan**, check its plan file for task checkboxes:
   - Count `[x]` (done) vs `[ ]` (pending) to estimate progress
   - Ralphex will resume from the first unchecked task automatically

4. **Verify worktrees still exist:**
   ```bash
   git worktree list
   ```
   If a worktree was removed (e.g., cleanup), recreate it from the plan's branch:
   ```bash
   git worktree add .ralphex/worktrees/<plan-stem> worktree-<plan-stem>
   ```
   The branch still exists in git — only the working directory needs recreation.

5. **Report current state to the user:**
   ```
   Resuming orchestration at Wave 2:
     04b-nav-layout:    completed (4/4 tasks)
     04c-settings:      completed (3/3 tasks)
     05a-communication: paused at task 3/6
     05b-documents:     paused at task 4/6
     05c-scheduling:    paused at task 2/6
     05d-calendar:      completed (4/4 tasks)

   Ready to relaunch 3 paused plans. Proceed?
   ```

6. **On user confirmation**, relaunch paused plans — ralphex resumes from first unchecked task:
   ```bash
   cd .ralphex/worktrees/<plan-stem> && bin/ralphex-dk --max-iterations 50 --wait 1h docs/plans/<plan-file>.md
   ```

7. **Update execution manifest** — set relaunched plans back to `running`.

### 4.6: Merge Wave

The merge plan is generated during Step 3 as part of the plan set. It gets its own host-side
worktree and runs ralphex the same way as all other plans. Its tasks include:

- Merge all parallel LOCAL branches (listed explicitly in the plan by branch name) via `git merge`
- Do NOT fetch from remote — local branches are the source of truth
- Resolve any integration conflicts between parallel tracks
- **Remove all mocks** introduced by parallel plans: delete mock files, replace mock imports with real implementations, verify no mock references remain
- Wire components together: plug tab components into workspace shell, connect pages to navigation, etc.
- Run full validation (`make lint && make typecheck && make test-unit && make test-e2e`)
- Update documentation (regenerate architecture diagrams if relevant files changed)

Ralphex runs its review and finalize phases on the merge plan like any other plan —
reviews catch integration issues, finalize rebases and pushes.

When the merge plan completes, report final status and proceed to automatic PR creation.

### 4.6.1: Automatic PR Creation

After the merge wave completes successfully, **automatically run `/create-pr`** — do not wait
for the user to invoke it manually. The `/create-pr` skill handles pushing, building PR content,
user confirmation, creating the PR, and cleaning up intermediate remote branches.

### 4.7: Cleanup

After orchestration is complete (merge plan done, PR created):

1. **Update the execution manifest**: set `Current State: completed`.

2. **Ensure completed plans have all checkboxes checked:**

   CRITICAL: The parent worktree's `docs/plans/` directory contains the **original plan files**
   written during Step 3 (plan generation) — these have unchecked `[ ]` boxes. Ralphex updates
   checkboxes and moves plans to `docs/plans/completed/` inside each **child worktree** during
   execution. After merging child branches, the correct checked versions are already on the
   merged branch in `docs/plans/completed/`.

   **Do NOT manually move plan files from the parent's `docs/plans/` to `completed/`** — this
   overwrites the checked versions with stale unchecked originals.

   Instead:
   - Verify that `docs/plans/completed/` already contains the checked plans from merged branches.
     Run: `grep -c '\- \[ \]' docs/plans/completed/2026-*` — should be 0 for each file.
   - If any plan is missing from `completed/` (e.g., merge plan failed before finalize), copy it
     from the child worktree: `cp .ralphex/worktrees/<plan-stem>/docs/plans/completed/<plan>.md docs/plans/completed/`
     or from `docs/plans/<plan>.md` inside the child worktree if it wasn't moved yet.
   - Delete the stale untracked originals from the parent's `docs/plans/`:
     `rm docs/plans/2026-*-<orchestration-plans>.md` (only the ones belonging to this orchestration).
   - Move the execution manifest to `completed/`:
     `mv docs/plans/*-execution.md docs/plans/completed/`

3. **Prune stale worktree references:** `git worktree prune`
   - Git tracks worktrees in `.git/worktrees/`. If a worktree directory is deleted without
     `git worktree remove`, git still thinks the branch is checked out there, blocking future checkouts.
   - `git worktree prune` cleans up these stale references.
4. **Remove local worktree directories** if no longer needed:
   - `git worktree remove .ralphex/worktrees/<name>` for each intermediate worktree
   - This properly unregisters the worktree AND deletes the directory
5. **Remote branch cleanup** is handled by Step 4.6.1 (automatic PR creation via `/create-pr`)

## Key Principles

- **One question at a time** during the grill phase
- **Recommend an answer** for every question — have an opinion
- **Explore codebase** instead of asking when the answer is in the code
- **Maximize parallelism** — only mark as sequential what truly must be sequential
- **Use mocks to eliminate dependencies** — parallel plans can mock sibling plan outputs; the merge plan removes mocks and wires real implementations
- **Validate plan size before generating** — each plan should have 3-6 focused tasks; split large plans, merge tiny ones
- **Context is king** — every plan gets the full context so ralphex subprocesses make informed decisions
- **The merge plan is mandatory** — parallel work always needs integration validation, mock removal, and component wiring
- **Rate limits are expected** — always use `--wait 1h` for parallel runs; ralphex waits and retries instead of exiting
- **Intervention over waiting** — proactively flag issues rather than waiting for TASK_FAILED
