# Exhaustion checklist - woodright-task-loop

Mark for the current run. Exhausted only when all applicable boxes are true.

## Always

- [ ] Trigger/mode/type parsed; commit intent clear
- [ ] Scope.md lists pathspecs + out-of-scope
- [ ] Unrelated dirty not staged / not «fixed away»
- [ ] Gates for type pack recorded with exit codes
- [ ] Evidence saved (or explicitly N/A with reason)
- [ ] FORMAT A (or owner schema) ready / delivered
- [ ] No secrets in reports

## If Codex required or requested

- [ ] `codex-review.md` written (not `_pending_` on success)
- [ ] `must-do: []`
- [ ] reviewer status + commit gate stated separately

## If commit intent

- [ ] Codex `safe_to_commit` when required by core table
- [ ] `git diff --cached --name-only` == allowed pathspecs
- [ ] Push only if «до пуша» / explicit push
- [ ] PR create/update only if review/merge flow needs it

## Type-specific

See [types.md](types.md). Domain pack checklists override when stricter
(e.g. material-execution `checklist.md`, media verify controls).
