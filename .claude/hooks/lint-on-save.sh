#!/bin/bash
# PostToolUse hook: runs ESLint after Edit/Write on TypeScript files.
# Reads tool use JSON from stdin, extracts file path, lints if applicable.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Skip if no file path extracted
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Skip generated files
if [[ "$FILE_PATH" == *"zenstack/generated"* ]]; then
  exit 0
fi

# Only lint TypeScript/TSX files
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.tsx ]]; then
  exit 0
fi

# Run lint if the file exists
if [[ -f "$FILE_PATH" ]]; then
  RESULT=$(yarn lint 2>&1) || true
  if echo "$RESULT" | grep -q "error"; then
    echo "ESLint errors detected. Run 'yarn lint' to see details." >&2
  fi
fi

exit 0
