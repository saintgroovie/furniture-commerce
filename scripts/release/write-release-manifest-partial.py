#!/usr/bin/env python3
"""Write partial Woodright release manifest after GHCR push (CI helper)."""
from __future__ import annotations

import datetime
import json
import os
import sys


def main() -> int:
    sha = os.environ["SHA"]
    be = os.environ["BACKEND_DIGEST"]
    sf = os.environ["STOREFRONT_DIGEST"]
    prefix = os.environ["IMAGE_PREFIX"]
    if not be.startswith("sha256:") or not sf.startswith("sha256:"):
        print("digests must start with sha256:", file=sys.stderr)
        return 1
    doc = {
        "schema_version": "1",
        "release_sha": sha,
        "branch": os.environ.get("GITHUB_REF_NAME") or "",
        "pr_number": None,
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "build_timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "backend": {
            "repository": f"{prefix}-backend",
            "tag": sha,
            "digest": be,
            "oci_revision": sha,
            "oci_source": "https://github.com/saintgroovie/furniture-commerce",
        },
        "storefront": {
            "repository": f"{prefix}-storefront",
            "tag": sha,
            "digest": sf,
            "oci_revision": sha,
            "oci_source": "https://github.com/saintgroovie/furniture-commerce",
        },
        "catalog_order_version": "merchandising-v1",
        "database_migrations": [],
        "deployment_owner": "Dokploy+manual_flock_deploy",
        "target_environment": "staging",
        "previous": {
            "release_sha": None,
            "backend_digest": "sha256:" + ("0" * 64),
            "storefront_digest": "sha256:" + ("0" * 64),
        },
        "rollback": {
            "backend_keeper": "FILL_BEFORE_CUTOVER",
            "storefront_keeper": "FILL_BEFORE_CUTOVER",
            "backup_directory": "FILL_BEFORE_CUTOVER",
            "commands_path": "FILL_BEFORE_CUTOVER",
        },
        "public_urls": {
            "site": "https://woodright-demo.ru/",
            "catalog": "https://woodright-demo.ru/catalog",
            "kids_catalog": "https://woodright-demo.ru/kids/catalog",
            "api": "https://api.woodright-demo.ru",
        },
        "verification": {
            "verified_at": None,
            "marker": None,
            "product_count": None,
            "first_catalog_title": None,
            "notes": "Partial CI artifact — fill previous/rollback before cutover; pin digests not tags.",
        },
        "notes": "Mutable tags may drift; authorized identity is digest fields.",
    }
    if doc["backend"]["oci_revision"] != doc["storefront"]["oci_revision"]:
        print("sha mismatch", file=sys.stderr)
        return 1
    if doc["backend"]["oci_revision"] != doc["release_sha"]:
        print("revision != release_sha", file=sys.stderr)
        return 1
    os.makedirs("release-artifacts", exist_ok=True)
    path = "release-artifacts/release-manifest.partial.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    print("sha_parity=ok wrote", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
