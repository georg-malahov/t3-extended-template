# Verify Infrastructure Port from theomedis-physio

## Overview

Verify and fix the infrastructure migration from theomedis-physio to the template.
This plan reviews all ported files for consistency, ensures no domain-specific references
leaked through, validates cross-references between files, and fixes any issues found.

## Context

A large batch of infrastructure files was ported from the theomedis-physio project:
- Docker: single-container approach replacing docker-compose (Dockerfile.ralphex + init scripts)
- Makefile: complete rewrite for per-worktree container isolation
- CI/CD: 2-phase CI with 4-shard E2E + GHCR image caching
- Ralphex: agent model headers, finalize/review prompts, enhanced config
- Claude: new commands (create-pr, orchestrate), hooks (docs-reminder), skills (generate-docs)
- Config files: playwright, eslint, vercel, gitignore, package.json scripts
- Scripts: session-start.sh, cloud-setup.sh
- CLAUDE.md: comprehensive generic version

The port was done as a batch operation. This plan verifies everything is correct.

## Development Approach
- Testing approach: Validation-focused (no application code changes)
- CRITICAL: every check must produce actionable fixes if issues found
- CRITICAL: genericize any remaining theomedis/domain references

## Implementation Steps

### Task 1: Verify no domain-specific references remain

- [x] Search all tracked files for `theomedis`, `physio`, `fall`, `patient`, `therapeut`, `einladung`, `termin`, `email-matching`, `email-verarbeitung`, `email-reassignment`, `fall-id`, `fall-stufe`, `dokument`, `vorlage`, `auditEintrag` — fix any hits
- [x] Search for mail server references: `dovecot`, `postfix`, `poste`, `mail-init`, `poste-shim`, `IMAP`, `SMTP`, `imapflow`, `nodemailer`, `EMAIL_ENCRYPTION_KEY` — fix any hits
- [x] Search for theomedis-specific test accounts: `TEST_OWNER_`, `TEST_ADMIN_`, `TEST_OPERATOR_`, `TEST_THERAPEUT_`, `POSTE_ADMIN`, `SSRF_ALLOWED` — fix any hits
- [x] Verify `MINIO_BUCKET` references consistently use `app-storage` (not `theomedis`)
- [x] Verify container name prefix is consistently `t3app-` everywhere (Makefile, CI, bin/ralphex-dk)

### Task 2: Validate cross-references between files

- [x] Verify Dockerfile.ralphex COPY paths match actual files in `.claude/docker/`
- [x] Verify Makefile targets reference correct yarn scripts from package.json
- [x] Verify CI workflow references match Makefile patterns (container naming, image name)
- [x] Verify CLAUDE.md Makefile table matches actual Makefile targets
- [x] Verify CLAUDE.md env vars table matches .env.example variables
- [x] Verify vercel.json buildCommand references valid package.json scripts (db:migrate not db:push)
- [x] Verify .gitignore covers all generated/runtime files mentioned in CLAUDE.md
- [x] Verify eslint ignores match directories present in project

### Task 3: Validate ralphex and Claude tooling consistency

- [ ] Verify `.ralphex/config` has all expected keys (codex_enabled, plans_dir, finalize_enabled, wait_on_limit, claude_limit_patterns)
- [ ] Verify all `.ralphex/agents/*.txt` files have model frontmatter headers
- [ ] Verify `.ralphex/prompts/task.txt` references correct validation command (`yarn lint && yarn typecheck && yarn test:unit`)
- [ ] Verify `.ralphex/prompts/task.txt` does NOT reference `make` commands (they fail inside ralphex-dk)
- [ ] Verify `.claude/settings.json` has all required permissions (make, yarn, git, docker, gh, etc.)
- [ ] Verify `.claude/hooks/lint-on-save.sh` and `docs-reminder.sh` are executable and have correct shebang
- [ ] Verify `.claude/commands/` has all expected commands: `ralphex.md`, `ralphex-plan.md`, `ralphex-update.md`, `create-pr.md`, `orchestrate.md`
- [ ] Verify `.claude/skills/generate-docs/SKILL.md` scopes match template models (no fall, email, etc.)
- [ ] Verify `bin/ralphex` and `bin/ralphex-dk` are executable

### Task 4: Validate Docker and CI infrastructure

- [ ] Verify Dockerfile.ralphex doesn't reference mail-init.sh, poste-shim.js, or any mail packages
- [ ] Verify Dockerfile.ralphex init script append order is correct (pg → minio → doppler → app)
- [ ] Verify env-init.sh overrides match Dockerfile ENV defaults
- [ ] Verify CI ci.yml does NOT have mail server wait step
- [ ] Verify CI build-dev-image.yml paths-trigger list is complete (docker files + package.json + yarn.lock)
- [ ] Verify scripts/session-start.sh and scripts/cloud-setup.sh have no theomedis-specific logic
- [ ] Verify scripts are executable (`chmod +x`)

### Task 5: Run validation and commit fixes

- [ ] Run `yarn lint` (may require container — verify it works)
- [ ] Run `yarn typecheck` (may require container — verify it works)
- [ ] Commit any fixes found in tasks 1-4
- [ ] Verify no uncommitted changes remain
