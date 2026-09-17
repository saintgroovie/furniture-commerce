# Timeweb demo runtime (live)

**Live public demo VM:** `200.169.188.39` (`woodright-demo.ru`, `www`, `api`).

Dokploy UI: SSH tunnel only. See `docs/operator/dokploy-ssh-tunnel-access.md`.

```sh
ssh -N -L 33000:127.0.0.1:3000 woodright-demo-vm
```

Then `http://127.0.0.1:33000`. Do not publish `:3000`.

## SSH key (operator Mac, not in git)

Private key **is not** in the repository. Do not commit it. Do not paste it into chat, docs, or screenshots.

| Item | Value |
|---|---|
| Live path (2026-09-17) | `/Users/leonidmbp/Desktop/woodright-demo-mac/woodright-demo-mac` |
| Stale path (do not use) | `/Users/leonidmbp/Downloads/woodright-demo-mac/woodright-demo-mac` (missing) |
| User on VM | `leonid` |
| Mode | `0600`, owner `leonidmbp` |
| `~/.ssh/config` aliases | `woodright-demo-vm` → `200.169.188.39` (Timeweb, live); `woodright-yandex-vm` → `89.169.188.29` (Yandex, leftover until billing stop) |

Expected `~/.ssh/config` fragment (key path only, no key material):

```sshconfig
Host woodright-demo-vm
  HostName 200.169.188.39
  User leonid
  IdentityFile /Users/leonidmbp/Desktop/woodright-demo-mac/woodright-demo-mac
  IdentitiesOnly yes
  IdentityAgent none
  StrictHostKeyChecking yes

Host woodright-yandex-vm
  HostName 89.169.188.29
  User leonid
  IdentityFile /Users/leonidmbp/Desktop/woodright-demo-mac/woodright-demo-mac
  IdentitiesOnly yes
  IdentityAgent none
  StrictHostKeyChecking yes
```

```sh
ssh woodright-demo-vm 'hostname; hostname -I'
```

After the Yandex VM is gone: delete `Host woodright-yandex-vm`. Keep the Desktop key until a replacement key is installed on Timeweb.

## What runs here

One public demo pair: `woodright-staging-*` + Dokploy `v0.29.12` + Traefik.

Daily backup timer: `woodright-backup.timer` (02:17 UTC). Postgres container pin: `WOODRIGHT_PG_CONTAINER=woodright-staging-postgres` via `/usr/local/sbin/woodright-backup-run`.

Backup root: `/srv/woodright/backups/automated/` (root `0700`).

## Yandex Cloud evacuation (2026-09-17)

Former demo host `89.169.188.29` (Yandex Cloud `ru-central1-b`) was still running three stacks. Unique data was copied **before** billing stop:

| Path | Contents |
|---|---|
| Timeweb `/srv/woodright/evac-from-yc-20260917T184508Z/` | Full evac bundle (dumps, runtime JSON, import, compose, ops) |
| Timeweb `/srv/woodright/backups/evac-from-yc-20260917T184508Z/` | Postgres dumps only |
| Mac `/Users/leonidmbp/Documents/projects/woodright-backups/evac-yc-20260917T184508Z/postgres/` | Same dumps, second copy |

Dumps (custom-format `-Fc`), not restored onto live demo:

- `woodright_staging`
- `woodright_production` (candidate)
- `woodright_public_production`
- two July verify DBs
- Dokploy panel DB

Not copied (duplicates or recoverable): 23 GB media tarballs, `/srv/woodright/src` ops-install checkouts.

Do **not** restore these dumps onto live `woodright_staging` without a separate owner approval. Isolated rehearsal only (`docs/operator/backup-restore-runbook.md`).

Apex cutover helper still names the old Yandex A in `ops/release/cutover-public-apex-routing.sh` (`NEW_STACK_A`). That pair is **not** running on Timeweb. Do not retarget `woodright.ru` DNS until public_production is stood up here.
