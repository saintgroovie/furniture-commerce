#!/usr/bin/env python3
"""Check private archive bytes against restored attachment metadata; output counts only."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tarfile


def verify(manifest, rows):
    component = manifest.get("private_files")
    if not component:
        if rows:
            raise ValueError("attachment metadata requires a private files archive")
        return {"required": False, "verified_references": 0}
    archive_path = component.get("path", "")
    if not os.path.isfile(archive_path) or os.path.islink(archive_path):
        raise ValueError("private archive missing or unsafe")
    digest = hashlib.sha256()
    with open(archive_path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != component.get("sha256"):
        raise ValueError("private archive checksum mismatch")
    expected = {r["storage_key"]: r for r in rows}
    if len(expected) != len(rows):
        raise ValueError("duplicate restored blob reference")
    seen = set()
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive:
            if member.name == "." and member.isdir():
                continue
            name = member.name.removeprefix("./")
            if not member.isfile() or not re.fullmatch(r"blob_[A-Za-z0-9_-]{1,160}", name) or name in seen:
                raise ValueError("unsafe or duplicate private archive entry")
            if member.size > 8 * 1024 * 1024:
                raise ValueError("oversized private archive entry")
            seen.add(name)
            sha = hashlib.sha256()
            with archive.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    sha.update(chunk)
            if name in expected:
                row = expected[name]
                if member.size != row["size"] or sha.hexdigest() != row["sha256"]:
                    raise ValueError("restored attachment bytes mismatch")
    if not set(expected).issubset(seen):
        raise ValueError("referenced attachment missing from archive")
    return {"required": True, "verified_references": len(expected), "archive_verified": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--restore-container", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"wr-pp-restore-pg-[A-Za-z0-9_-]+", args.restore_container):
        raise SystemExit("private verification only accepts disposable restore containers")
    command = ["docker", "exec", args.restore_container, "psql", "-U", "woodright", "-d", "woodright_restore_rehearsal", "-tA", "-v", "ON_ERROR_STOP=1", "-c"]
    exists = subprocess.check_output(command + ["select coalesce(to_regclass('public.woodright_private_attachment')::text, '')"], text=True).strip()
    rows = []
    if exists:
        rows = json.loads(subprocess.check_output(command + ["select coalesce(jsonb_agg(r), '[]'::jsonb) from (select storage_key, sha256, size from woodright_private_attachment) r"], text=True))
    with open(args.manifest) as stream:
        result = verify(json.load(stream), rows)
    print(json.dumps(result))
