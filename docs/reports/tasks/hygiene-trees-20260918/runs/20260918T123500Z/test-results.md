# Test results - 20260918T123500Z

Type pack: `docs` (+ tiny gitignore). Runtime gates not required.

| Check | Exit | Notes |
|---|---|---|
| `git check-ignore` `.nosync` | 0 | ignored |
| `git check-ignore` `apps/storefront/.nosync` | 0 | ignored via `**/.nosync` |
| `git check-ignore` `.woodright-worktrees/example` | 0 | ignored |
| `git check-ignore` `.github/context-mode/sessions/stats-pid-1.json` | 0 | ignored |
| `git check-ignore` `docs/reports/tasks/hygiene-trees-20260918/latest.md` | 1 | not ignored (must stay tracked) |
| Storefront/backend tests | n/a | no runtime code applied |
| Canonical dirty | unchanged | not restored / not switched |
| C2/C3/C4 apply | skipped | parked; see evidence/patches/README.md |
