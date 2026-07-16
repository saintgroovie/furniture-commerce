# Codex prompt - woodright-task-loop (universal)

Copy into MCP `user-codex-woodright-reviewer` / tool `codex`  
(`sandbox: read-only`, `approval-policy: never`).

Replace bracketed sections from the current run.

```text
Woodright independent review (read-only): universal task LOOP.

## Goal
Verify the agent closed the workstream honestly: scope held, gates match type pack, evidence exists, must-do can be empty, commit pathspecs safe.

## Loop meta
- Trigger / mode: [луп | луп до пуша | луп: fix | луп: verify]
- Type pack: [generic|storefront|backend|pricing|media|rules|docs]
- Commit intent: [yes|no]
- Task slug: [slug]
- Run dir: docs/reports/tasks/[slug]/runs/[UTC]/
  (or domain report path if pack owns artifacts)

## Inputs (read)
- .cursor/skills/woodright-task-loop/SKILL.md
- .cursor/skills/woodright-task-loop/types.md
- runs/.../baseline.md, scope.md, test-results.md, fix-log.md
- Staged or proposed pathspecs (git diff / name-only)
- Domain skill if pack used (pricing/media/…)
- Touched implementation files (scoped)

## Invariants
- Pathspecs only; no unrelated dirty
- Foreground-only; no prod DB/seed/apply without approval
- Codex fields not collapsed into one «Verdict»
- Medusa SoT for commerce; storefront thin client

## Latest summary
[paste gate exits, failed checks, SHA, open questions]

## Ask (strict output)
1) Findings table P0–P3 (or empty)
2) Remaining must-do as JSON array (empty if exhausted)
3) Codex reviewer status: approve | approve-with-notes | request-changes
4) Codex commit gate: safe_to_commit | needs_fixes | unsafe_scope | n/a
5) Exact pathspecs allowed to commit (if gate allows); call out mixed dirty files to exclude
6) Any false confidence in evidence?

Do not edit files. Concise only.
```
