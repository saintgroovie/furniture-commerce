# Production Admin bootstrap (private only)

## Hard rules

- Do **not** create a permanent Admin during source/PR cycles without an exact owner email + separate approval.
- Do **not** publish `admin.woodright.ru` or any public Traefik Admin router.
- Do **not** copy staging credentials into production.
- Do **not** put passwords in shell history, git, evidence, or chat.

## Preconditions

1. Private production-candidate healthy on certified digests.
2. Canonical lock acquired for the bootstrap window.
3. Target DB is `woodright_production` (parse `DATABASE_URL` path only; never print password).
4. `WOODRIGHT_EXPOSURE=private` still true during bootstrap.
5. Owner supplied exact Admin email in the same message as authorization.

## Dry-run (safe)

```sh
bash scripts/ops/admin-bootstrap-dry-run.sh --environment production
```

Expected checks:

- container `woodright-production-backend` healthy
- DB name `woodright_production`
- `user` count printed as integer only
- staging DB name must not appear
- no credentials printed

## Create (owner-authorized only)

Use Medusa operator invite/create flow against the private bind via SSH tunnel
(see `docs/operator/production-admin-private-access.md`).

After create:

1. Verify `user` count ≥ 1
2. Login once through the tunnel URL
3. Confirm Admin UI origin stays private
4. Release lock
5. Record email handle only (not password) in operator notes outside git

## Recovery

- Password reset via Medusa Admin invite/reset against private tunnel
- Break-glass: second private Admin created under a new owner authorization
- Revoke compromised sessions via Admin security settings when available
