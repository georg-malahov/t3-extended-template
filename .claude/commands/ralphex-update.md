# ralphex-update - Smart Prompt Merging

**SCOPE**: Compare current embedded defaults with user's installed config, and intelligently merge updates into customized prompts/agents. Preserves user intent while incorporating structural changes.

## Step 0: Verify CLI Installation

```bash
which ralphex
```

**If not found**, guide installation:
- **macOS (Homebrew)**: `brew install umputun/apps/ralphex`
- **Any platform with Go**: `go install github.com/umputun/ralphex/cmd/ralphex@latest`

**Do not proceed until `which ralphex` succeeds.**

## Step 1: Extract Current Defaults

Create temp directory and dump embedded defaults:

```bash
DUMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ralphex-defaults-XXXX")
ralphex --dump-defaults "$DUMP_DIR"
echo "$DUMP_DIR"
```

Save the dump directory path for later use.

## Step 2: Determine Config Directory

The project config directory is `.ralphex/` in the project root. Verify it exists:

```bash
ls -la .ralphex/
```

If it doesn't exist, inform user that ralphex hasn't been configured yet and there's nothing to update.

## How ralphex Config Files Work

ralphex installs config, prompt, and agent files with all content **commented out** (every line prefixed with `# `). At runtime, `stripComments()` removes these lines, finds nothing, and falls back to **embedded defaults** compiled into the binary. These all-commented files are functionally identical to missing files — they are do-nothing placeholders.

When ralphex is updated, new embedded defaults take effect **automatically** for every file that hasn't been customized. No file changes are needed.

A file is **customized** only if it contains at least one uncommented, non-empty line that was intentionally modified by the user. The `--dump-defaults` command produces the raw (uncommented) embedded content for comparison.

## Step 3: Compare Files

For each file in the defaults dump (`config`, `prompts/*.txt`, `agents/*.txt`), compare with the corresponding file in the project's `.ralphex/` directory.

**Algorithm to detect customized files**: a file is customized if it contains at least one non-empty line that does NOT start with `#`. Files that are missing, empty, or contain only comment lines (`# ...`) and whitespace are do-nothing defaults.

**Classify each file into one of these categories:**

### Skip (do-nothing default)
- File is missing in `.ralphex/`, OR
- File is empty, OR
- File contains only comments and whitespace
- **Action**: no action needed — embedded defaults handle it automatically

### Skip (unchanged)
- File has uncommented content that matches the raw dump default
- **Action**: no action needed

### Smart merge needed
- File has uncommented content that differs from the raw dump default
- **Action**: needs Claude to semantically analyze and propose merge

## Step 4: Present Summary

Show summary with two groups:

```
ralphex config update summary:

No changes needed (N files):
  prompts/task.txt, agents/quality.txt, ...

Smart merge needed (N files):
  agents/implementation.txt
```

If nothing needs merging, report "all config files are up to date" and skip to cleanup.

Otherwise, use AskUserQuestion to confirm proceeding:
- header: "Proceed"
- question: "Review smart merges?"
- options:
  - label: "Yes, proceed"
    description: "Review and merge customized files one at a time"
  - label: "Skip, just show details"
    description: "Show what changed without modifying anything"

## Step 5: Process Smart Merges

For each customized file that needs merging:

1. Read both versions (new default and current `.ralphex/` version)
2. Analyze differences semantically
3. Propose merged version preserving user customizations
4. Use AskUserQuestion for each file:
   - header: "Merge"
   - question: "How to handle <filename>?"
   - options:
     - label: "Accept merge" / label: "Keep mine" / label: "Use new default"
5. Apply the user's choice

## Step 6: Cleanup

Remove temp directory and report final summary.

## Merge Principles

- **Preserve user additions**: content the user added that doesn't exist in defaults should be kept
- **Apply structural changes**: apply new structure while keeping user's custom content
- **Update template variables**: include new `{{VARIABLE}}` references
- **Preserve user tone/style**: keep their style while incorporating new functionality
- **Flag conflicts clearly**: present both versions and let the user choose
- **Don't lose information**: when in doubt, keep both versions with clear markers

## Constraints

- This command is ONLY for updating `.ralphex/` configuration files
- Do NOT modify any project source code
- Do NOT run ralphex execution or review
- Always clean up the temp directory when done
