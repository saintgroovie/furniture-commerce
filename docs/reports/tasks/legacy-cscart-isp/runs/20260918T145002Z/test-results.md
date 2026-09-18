# Gates - docs pack

| Gate | Command / check | Exit |
|---|---|---|
| Related paths exist | 5 operator/content files on this tree | 0 |
| Pointer secret-like scan | `rg` password/csrf/PEM/mysql URI on `legacy-cscart-site.md` | 0 (ban-list prose only) |
| Private SQL/tar/config.local.php exist | `test -f` Documents private export | 0 |
| `openssl x509` woodright.ru | issuer YR1; SAN `woodright.ru` + `www.woodright.ru`; notAfter Dec 17 2026 | 0 |
| `openssl x509 -checkend 86400` | certificate will not expire within 1 day | 0 |
| `curl -sI --max-time 15 --http2 https://woodright.ru/` | HTTP/2 200; nginx 1.30.2; PHP 7.4.33 | 0 |
| `git fetch origin main` | still `07a34c6` | 0 |
| Diff vs `origin/main` (committed) | only `docs/operator/legacy-cscart-site.md` | 0 |
| Unrelated storefront dirty | absent in this worktree | n/a |

Runtime storefront/Medusa: N/A (docs pack).
