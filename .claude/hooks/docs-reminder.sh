#!/bin/bash
# PostToolUse hook: reminds to regenerate architecture docs when key files change.
# Reads tool use JSON from stdin, checks if the edited file affects architecture docs.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Skip if no file path extracted
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Check if the file is one that affects architecture documentation
NEEDS_REMINDER=false

case "$FILE_PATH" in
  *schema.zmodel)
    NEEDS_REMINDER=true
    ;;
  *src/lib/auth*.ts|*src/lib/db.ts|*src/lib/provisioning.ts|*src/lib/session.ts)
    NEEDS_REMINDER=true
    ;;
  *src/lib/storage.ts)
    NEEDS_REMINDER=true
    ;;
esac

# Check src/app/ page and route files at any depth
if [[ "$FILE_PATH" == *src/app/* && ("$FILE_PATH" == *page.tsx || "$FILE_PATH" == *route.ts) ]]; then
  NEEDS_REMINDER=true
fi

if [[ "$NEEDS_REMINDER" == "true" ]]; then
  echo "Note: The file you just edited may affect architecture documentation in docs/architecture/. If you made structural changes to schema, routes, modules, or pages, consider running /generate-docs to keep diagrams up to date."
fi

exit 0
