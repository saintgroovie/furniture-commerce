# Package F — Dashboard data contract

**Date:** 2026-07-12 (MSK)  
**Source of truth:** Medusa Admin REST only (no custom write SoT).  
**Route:** `GET` counters via browser `credentials: include` against `/admin/*`.

## Principles

1. No whole-catalog download for dashboard.
2. Prefer `limit=1` + `count` (or small pages) for counters.
3. Search uses server `q` with pagination.
4. No custom mutation endpoints in Package F.
5. Optional thin read-only custom Admin route only if stock filters cannot produce a counter — prefer stock first.

## Counters (honest)

| Counter | How | Link target |
|---------|-----|-------------|
| Draft products | `GET /admin/products?status=draft&limit=1` → `count` | Stock `/app/products?status=draft` or Woodright search `?status=draft` |
| Published without thumbnail | Best-effort: sample pages with `fields=id,thumbnail,status` and count null thumbnails among loaded pages; if incomplete → label «оценка по выборке» | Product search / stock products |
| Promotions needing attention | **Not a global counter.** Link to `/app/woodright/promotions?filter=attention` without inventing a total; optional sample note if a bounded page is inspected | Promotions list filter |
| Promotions list | Open Woodright «Акции» | `/app/woodright/promotions` |

| Missing classification / price / SKU | Only if computable from limited product fields without N+1; otherwise omit or mark sample-based | Workspace / stock |

**Do not invent** failed media ops or “soon ending” without real fields.

## Search

`GET /admin/products?q=&limit=&offset=&fields=id,title,handle,thumbnail,status,*variants`  
Show title, handle, first SKU if present, status; open `/app/woodright/products/:id`.

## Recent

`GET /admin/products?limit=5&order=-updated_at&fields=…`  
`GET /admin/promotions?limit=5&order=-updated_at&fields=…`  
Only if API accepts `order`; else omit section.

## System block (operator)

- Feature flag on/off (browser)
- Last successful dashboard fetch timestamp
- Collapsed technical: HTTP errors only

Never show DB host, PID, Node, Vite.
