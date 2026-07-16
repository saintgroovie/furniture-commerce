#!/usr/bin/env bash
# sessionStart: inject short woodright-task-loop trigger cheat-sheet into context.
# Fail-open: always exit 0 (never block session creation).
set -u

# Drain stdin (Cursor hooks contract).
cat >/dev/null 2>&1 || true

ctx='Woodright task LOOP (skill: .cursor/skills/woodright-task-loop/):
Run only on explicit triggers: `луп` | `луп до пуша` | `луп: fix` | `луп: verify` | `луп: type=…`
Else if owner pastes a long Codex/fix/exhaust ritual: offer once (rule woodright-task-loop-offer.mdc). No nag after refusal. No auto-run on residual/until-exhausted alone.'

if command -v python3 >/dev/null 2>&1; then
  if out="$(python3 -c 'import json,sys; print(json.dumps({"additional_context": sys.argv[1]}, ensure_ascii=False))' "$ctx" 2>/dev/null)"; then
    printf '%s\n' "$out"
    exit 0
  fi
fi

# Fallback without python: minimal JSON (escape manually)
printf '{"additional_context":"Woodright task LOOP: use explicit triggers `луп` / `луп до пуша` / `луп: fix` / `луп: type=…`. Offer once on mega-prompts; never auto-run without trigger."}\n'
exit 0
