# Regenerating the source-media audit pack

**Output dir:** `tmp/source-media-completeness-audit-full-legacy-cache/`

## Quick restore (this repo)

Audit pack was copied from `furniture-commerce-emergency-fix` (2026-06-18).  
Required files: `source-orphan-priority-queue.json`, `all-source-media-manifest.json`, `source-media-completeness-summary.json`, `full-vs-stale-legacy-diff.json`.

## Full regen (emergency-fix repo)

```bash
cd /path/to/furniture-commerce-emergency-fix
node tmp/source-media-completeness-audit-full-legacy-cache/run-source-media-completeness-audit-full-legacy-cache.mjs
```

Depends on `tmp/legacy-media-public-yandex-rebuild/`, `tmp/legacy-site-media-rebuild/`, etc. in **that** repo.

## Verify in storefront

```bash
curl --max-time 15 http://localhost:3002/qa/source-media-orphan-review/api/bootstrap | head -c 200
# expect HTTP 200 + items array
```
