# Dokploy admin access (SSH tunnel)

Dokploy UI port `3000` is published for local/loopback use only. Public NIC access is blocked by `wr-p0-docker-user-blocks` (DOCKER-USER + INPUT on `eth0`).

## Open a tunnel from your laptop

```sh
ssh -N -L 33000:127.0.0.1:3000 leonid@<server-host>
```

Then open: `http://127.0.0.1:33000`

On the server itself: `http://127.0.0.1:3000`

## Do not

- Expose Dokploy on a public DNS hostname without a separate auth/TLS decision
- Open TCP `3000` in UFW for the internet
- Rely on UFW INPUT alone for Docker published ports

## Persistence

Unit: `wr-p0-docker-user-blocks.service` (After=`docker.service`). Re-run `/usr/local/sbin/wr-p0-docker-user-blocks.sh` after Docker recreates `DOCKER-USER` if needed; the script is idempotent.
