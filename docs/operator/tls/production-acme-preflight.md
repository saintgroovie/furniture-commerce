# TLS / ACME preflight (production) — preparation only

## Planned hosts
- woodright.ru
- www.woodright.ru
- api.woodright.ru

## Resolver
Traefik `certResolver: letsencrypt` (same family as demo). Prefer HTTP-01 after DNS points, or DNS-01 without web cutover if provider API is available.

## Preflight before live challenge (cutover cycle)
1. DNS A for apex/www/api already correct **or** DNS-01 chosen
2. Ports 80/443 free for Traefik on the VM (no conflicting nginx for those hosts)
3. Dynamic config validated (`traefik-woodright-production.INACTIVE.yml` rendered/activated only under approval)
4. Certificate storage writable by Traefik
5. SAN will include apex+www+api
6. Rollback: remove routers; DNS back to parking IP

## Hard bans in preparation cycle
- Do not activate routers
- Do not issue live certificates
- Do not enable HSTS preload
- Enable HSTS only after all public HTTPS hosts PASS
