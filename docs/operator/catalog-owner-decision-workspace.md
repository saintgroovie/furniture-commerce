# Catalog Owner Decision Workspace

Local owner UI for real catalog gaps (category, collection, mirrors).

- URL (local): `http://127.0.0.1:3051/`
- Start: `python3 tools/catalog-owner-decision-workspace/scripts/daemon_server.py start`
- Stop: `python3 tools/catalog-owner-decision-workspace/scripts/daemon_server.py stop`
- No production writes; decisions persist under `woodright-owner-artifacts/catalog-owner-decisions-workspace-*`
- Mutation preview is dry-run only (`not_authorized_for_apply`)
