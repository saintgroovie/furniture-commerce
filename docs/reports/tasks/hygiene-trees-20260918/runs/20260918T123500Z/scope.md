# Scope - hygiene-trees-20260918

## Trigger
Owner: «делай надежно и безопасно, чтобы ничего не сломать» after audit + commit plan (session 2026-09-18).

Mode: full loop, **no push**. Commit only the non-regressive hygiene slice.

## In this run
- Isolated worktree from `origin/main` (`~/.woodright/worktrees/hygiene-safe-20260918`)
- Capture unique leftover diffs as parked patches (do not apply as-is)
- `.gitignore` for local noise (`.nosync`, nested `.woodright-worktrees/`, context-mode session pids)

## Out of scope (explicit, this run)
- Canonical `git switch` / restore (iCloud dirty tree; carrying `globals.css` onto `main` would regress CSS)
- Runtime clone update (`runtime-candidate-main`)
- LaunchAgent / ports / Docker
- Worktree prune (destructive; needs a separate named «удаляй деревья»)
- Closing GitHub PRs
- Applying C2 route-veil patch as-is (removes boot failsafe timeout + stops polling while `.route-loading-fallback` exists)
- Applying C3 `product-card.tsx` (bypasses `cardThumbnailSrcFromProduct`; owner gate)
- Applying C4 catalog-browse slim as-is (promotion slot reuses browse projection; `promotion-card` reads `buyer_default_configuration.material_execution_code` for «от »)

## Pathspecs allowed this run
- `.gitignore`
- `docs/reports/tasks/hygiene-trees-20260918/**`
