# Tag drift investigation (2026-07-21)

## Root cause (proven by workflow code + Actions runs)

Sole GHCR writer: `.github/workflows/build-staging-images.yml` (`workflow_dispatch`).

Historical behavior (pre-hardening): each run pushed mutable tags:

- `:${FULL_SHA}`
- `:sha-${FULL_SHA}`

Re-running the workflow for the **same** Git SHA moved those tag names to **new digests**. Storefront bake uses secrets (`NEXT_PUBLIC_*`), so content can change without a Git SHA change.

## Verified runs

| Run | Head SHA | Role | Conclusion |
|---|---|---|---|
| [29830575969](https://github.com/saintgroovie/furniture-commerce/actions/runs/29830575969) | `5683afa…` | Authorized merchandising images used for cutover digests BE `578bd815…` / SF `0f422482…` | success |
| [29831078910](https://github.com/saintgroovie/furniture-commerce/actions/runs/29831078910) | `5683afa…` | Rebuild same SHA → overwrote `:5683afa…` tags to different digests | success |
| [29838506221](https://github.com/saintgroovie/furniture-commerce/actions/runs/29838506221) | `dd3fe64…` | Home WebP build; published its own tags; did **not** rewrite `:5683afa…` | success |

## Live impact

Tag overwrite alone does not change digest-pinned containers. At audit time live had already moved to SHA `4997bb7…` with digests BE `ab9715ad…` / SF `e13bc506…` (owner JSON). Prompt baseline `5683afa` is historical.

Raw inspect dumps (not in Git): `/tmp/woodright-build-provenance-hardening-20260721/ghcr-tags-before.json`, `tag-drift-timeline.json`.
