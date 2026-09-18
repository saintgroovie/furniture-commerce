# Scope - legacy-cscart-isp

- Trigger: `луп до пуша`
- Mode: full until exhausted
- Type pack: `docs`
- Commit intent: yes + push
- Task slug: `legacy-cscart-isp`

## Pathspecs in

- `docs/operator/legacy-cscart-site.md`
- `docs/reports/tasks/legacy-cscart-isp/**`

## Out of scope

- Storefront dirty files on `docs/timeweb-demo-cutover-20260917`
- Panel daily diffs, `images/`, `var/cache`, second SQL inside tar, Adminer copy
- Live host mutations (delete `__sql.php`, leftover certs, DNS, `backup2.restore`)
- Apex cutover to the new stack
- Secrets / dumps / `config.local.php` values (private Documents only)

## Dirty isolation

Canonical checkout stays on `docs/timeweb-demo-cutover-20260917` with unrelated storefront dirty. This run uses worktree `docs/legacy-cscart-isp-20260918` from `origin/main` so those files are not staged.
