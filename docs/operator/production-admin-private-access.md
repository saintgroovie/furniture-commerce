# Private Admin access (production-candidate)

Admin is **private only** for the approved launch profile.
There is **no** `admin.woodright.ru` and no public Traefik Admin router.

## Cookie + same-origin constraints

Production Medusa sets `Secure` session cookies. The Admin Vite bundle must call the **same origin** as the browser tab (`ADMIN_BACKEND_URL` empty / same-origin), not `https://api.woodright.ru`.

Approved public-profile `ADMIN_CORS` / Auth Admin entries are exact loopback origins on port **9200** only:

- `https://127.0.0.1:9200`
- `https://localhost:9200`
- (http variants exist for non-public candidates; do not use bare HTTP for Secure-cookie login)

## Canonical topology (HTTPS on :9200)

Use local TLS on the browser port, and put the SSH tunnel on a **different** local port so CORS origins stay on `:9200`.

```text
Browser  https://127.0.0.1:9200/app
   → local TLS terminator :9200
   → SSH tunnel local :19200  →  VM 127.0.0.1:9200 (Medusa Admin)
```

### Steps

1. SSH tunnel (plain TCP to a non-browser local port):

```sh
ssh -i <IdentityFile> -L 19200:127.0.0.1:9200 -N leonid@<vm-host>
```

2. Local TLS terminator listening on `:9200`, proxying to `http://127.0.0.1:19200` (operator-managed cert; example tooling is local preference).

3. Browser:

`https://127.0.0.1:9200/app`

4. Env on the public cutover profile (names only):

- `WOODRIGHT_ADMIN_EXPOSURE=private`
- `ADMIN_CORS=https://127.0.0.1:9200`
- `AUTH_CORS` includes buyer apex/www **and** `https://127.0.0.1:9200`
- `ADMIN_BACKEND_URL=` (empty - same-origin Admin)
- Do **not** point Admin at `MEDUSA_BACKEND_URL=https://api.woodright.ru`

## Private candidate (current non-public binds)

While the candidate remains loopback / `non_public_candidate` without public exposure, continue using the certified private bind for that image. Before any public-exposure cutover, verify Admin login over this HTTPS `:9200` topology with Secure cookies and empty `ADMIN_BACKEND_URL`.

## Alternatives (future, separate approval)

- WireGuard / private network to the VM with private HTTPS on an approved origin
- IP allowlist reverse proxy **without** public DNS name `admin.woodright.ru`

## Explicitly forbidden

- Public DNS for Admin
- Traefik Host(`admin.woodright.ru`)
- Opening Admin on the buyer apex
- Browser origin on a port not listed in `ADMIN_CORS` (e.g. `:9443` while allowlist is `:9200`)
- Sharing Admin session cookies over chat/screenshots
- Relying on `http://127.0.0.1:9200/app` for Secure-cookie production login

## Logout / audit

- Use Admin logout after operator sessions
- Keep mutation lock meta for who held cutover/bootstrap locks
- Do not log Authorization headers or passwords (access-log redaction remains mandatory)
