#!/usr/bin/env bash
# Invoked after pg_dump: immutable blobs are written before their database rows commit.
# Thus the later archive contains every referenced blob in the earlier DB snapshot.
# No physical blob purge is permitted while this backup strategy is in use.
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib/woodright-backup-root.sh"
ROOT="${WOODRIGHT_BACKUP_ROOT:?}"
BE="${WOODRIGHT_BE_CONTAINER:?}"
EXPECTED_VOLUME="woodright-public-production_woodright_private_files"
wr_assert_backup_root "$ROOT"
[[ "$BE" == "woodright-public-production-backend" ]] || { echo 'private backup requires public production backend' >&2; exit 1; }
BE_ID="$(docker inspect "$BE" --format '{{.Id}}')"
VOLUME="$(docker inspect "$BE_ID" --format '{{json .Mounts}}' | python3 -c 'import json,sys; print(next((m.get("Name", "") for m in json.load(sys.stdin) if m.get("Destination")=="/var/lib/woodright/private-files"), ""))')"
[[ "$VOLUME" == "$EXPECTED_VOLUME" ]] || { echo 'private files mount mismatch' >&2; exit 1; }
wr_ensure_dir "$ROOT/private-files"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$ROOT/private-files/woodright_private_files_${TS}.tar.gz"
[[ ! -e "$TARGET" && ! -e "$TARGET.partial" ]] || { echo 'private archive already exists' >&2; exit 1; }
docker exec "$BE_ID" tar -czf - -C /var/lib/woodright/private-files . >"$TARGET.partial"
python3 - "$TARGET.partial" <<'PY'
import re, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive:
        if member.name == '.' and member.isdir(): continue
        name = member.name.removeprefix('./')
        if not member.isfile() or not re.fullmatch(r'blob_[A-Za-z0-9_-]{1,160}', name) or member.size > 8*1024*1024:
            raise SystemExit('private archive has an invalid entry')
        # Read every byte so decompression/truncation errors fail the backup.
        with archive.extractfile(member) as data:
            while data.read(1024*1024): pass
PY
mv "$TARGET.partial" "$TARGET"
printf '%s\n' "$TARGET"
