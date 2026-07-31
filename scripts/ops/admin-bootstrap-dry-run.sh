#!/usr/bin/env bash
# LIVE_MUTATING=false — dry-run only; never creates Admin users.
set -euo pipefail

ENVIRONMENT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENVIRONMENT" == "production" ]] || {
  echo "ERROR: only --environment production supported for this dry-run"
  exit 2
}

NAME=woodright-production-backend
docker inspect "$NAME" >/dev/null
health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NAME")
echo "backend_health=$health"
[[ "$health" == "healthy" ]] || { echo "ERROR: backend not healthy"; exit 3; }

exposure=$(docker exec "$NAME" sh -c 'printf %s "$WOODRIGHT_EXPOSURE"')
role=$(docker exec "$NAME" sh -c 'printf %s "$WOODRIGHT_RUNTIME_ROLE"')
echo "exposure=$exposure role=$role"
[[ "$exposure" == "private" ]] || echo "WARN: exposure is not private (dry-run continues)"

dbname=$(docker exec "$NAME" node -e 'const u=process.env.DATABASE_URL||"";const m=u.match(/\/([^/?]+)(\?|$)/);console.log(m?m[1]:"")')
echo "db_name=$dbname"
[[ "$dbname" == "woodright_production" ]] || {
  echo "ERROR: refusing non-production DB name"
  exit 4
}
echo "$dbname" | grep -qi staging && { echo "ERROR: staging marker in db name"; exit 5; } || true

users=$(docker exec woodright-production-postgres \
  psql -U woodright_production -d woodright_production -tAc 'select count(*) from "user";' | tr -d '[:space:]')
invites=$(docker exec woodright-production-postgres \
  psql -U woodright_production -d woodright_production -tAc 'select count(*) from invite;' 2>/dev/null | tr -d '[:space:]' || echo 0)
echo "admin_users=$users"
echo "invites=$invites"
echo "DRY_RUN_OK=no_credentials_printed"
echo "NEXT=owner must supply exact Admin email + explicit create authorization"
