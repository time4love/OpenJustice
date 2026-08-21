#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Blocks destructive database commands unless the session has explicitly
# declared itself a database-cleanup session.
#
# Written after the 2026-08-21 staging wipe, in which a single
# `DROP SCHEMA "public" CASCADE` destroyed every row in the database. A written
# rule forbidding unsafe migration commands had landed hours earlier and did
# not prevent it — because a rule is advice, and this is a gate.
#
# The unlock is a file, not an env var, deliberately: creating
# .claude/DB_CLEANUP_SESSION is a separate, visible act, and the file's own
# contents are where the session records WHICH data it intends to remove. It
# therefore serves as both the key and the declaration of scope.
#
# Reads the PreToolUse payload on stdin, emits a permission decision on stdout.
# Fails OPEN on internal error (missing jq, unreadable input): a broken guard
# must not wedge every Bash command in the session. It is a safety net over the
# operator's judgement, never the only thing standing between us and the data.
# ---------------------------------------------------------------------------
set -uo pipefail

payload=$(cat 2>/dev/null) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0

# Whole-database or whole-table destruction, and the Prisma commands that
# perform it implicitly. `migrate dev` and `db push` are here because neither
# announces that it is about to reset — that is exactly how the wipe happened.
DESTRUCTIVE='drop[[:space:]]+schema|drop[[:space:]]+database|drop[[:space:]]+table|truncate[[:space:]]|prisma[[:space:]]+db[[:space:]]+push|prisma[[:space:]]+migrate[[:space:]]+reset|prisma[[:space:]]+migrate[[:space:]]+dev|--force-reset|--accept-data-loss|deleteMany|delete[[:space:]]+from'

printf '%s' "$cmd" | grep -qiE "$DESTRUCTIVE" || exit 0

# The simulator itself must never be blocked — it is how you find out what a
# statement does, and it always rolls back.
printf '%s' "$cmd" | grep -qE 'db:simulate|dbSimulate' && exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -f "$repo_root/.claude/DB_CLEANUP_SESSION" ]; then
  scope=$(head -c 400 "$repo_root/.claude/DB_CLEANUP_SESSION" 2>/dev/null)
  jq -n --arg s "$scope" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("DESTRUCTIVE DATABASE COMMAND.\n\nThis session is declared a cleanup session. Its stated scope:\n\n" + $s + "\n\nConfirm this command is inside that scope, and that `npm run db:simulate -- \"<statement>\"` has been run and its reported loss is the intended number.")
    }
  }'
  exit 0
fi

jq -n --arg c "$cmd" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("BLOCKED — destructive database command outside a declared cleanup session.\n\nCommand: " + $c + "\n\nData loss must never be a side effect of other work. To do this:\n1. Finish and land the work in progress.\n2. Start a NEW session whose sole stated purpose is this cleanup.\n3. Write the exact intended scope to .claude/DB_CLEANUP_SESSION.\n4. Run `npm run db:simulate -- \"<statement>\"` and confirm the reported row loss is exactly what was intended.\n5. Get the user to confirm the number before executing.\n\nSee docs/gf-staging-data-loss-postmortem-2026-08-21.md.")
  }
}'
exit 0
