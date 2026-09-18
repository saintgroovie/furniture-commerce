# Test results

- dump sha256: 6/6 OK (content)
- pg_restore --list: staging/candidate/public/verify via postgres:15-alpine; dokploy via postgres:16-alpine (411 TOC lines)
- Timeweb woodright-backup-run: success recovery-point-20260917T185853Z
- DNS woodright-demo.ru A=200.169.188.39
- HTTPS Host via Timeweb IP: 200
- SSH aliases woodright-demo-vm / woodright-yandex-vm: OK
- one-time rsync key removed both sides
- Yandex backup/monitor timers: disabled
