#!/usr/bin/env python3
"""Write build-manifest.json from GitHub Actions env (no secrets)."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

OUT = Path("release-artifacts/build-manifest.json")


def main() -> None:
    sha = os.environ["SHA"]
    run_id = os.environ["RUN_ID"]
    attempt = int(os.environ["ATTEMPT"])
    unique = os.environ["UNIQUE"]
    be = os.environ["BACKEND_DIGEST"]
    sf = os.environ["STOREFRONT_DIGEST"]
    started = os.environ.get("BUILD_STARTED_AT") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    completed = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    arg_names = [
        "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
        "MEDUSA_BACKEND_URL",
        "MEDUSA_BACKEND_INTERNAL_URL",
        "NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES",
    ]
    # Non-secret fingerprint: names + presence flags only
    fp_src = "|".join(arg_names) + f"|site_url_set={bool(os.environ.get('NEXT_PUBLIC_SITE_URL_SET'))}"
    fingerprint = hashlib.sha256(fp_src.encode()).hexdigest()[:32]
    release_mode = os.environ.get("RELEASE_MODE") or "main"
    aliases = []
    # Only record aliases when this build actually published them.
    pub = os.environ.get("PUBLISH_MUTABLE_ALIAS", "false")
    if pub in ("1", "true", "True"):
        aliases = [
            {
                "repository": "ghcr.io/saintgroovie/woodright-storefront",
                "tag": f"mutable-sha-{sha}",
                "mutable": True,
            },
        ]
        if release_mode != "isolated_storefront":
            aliases.insert(
                0,
                {
                    "repository": "ghcr.io/saintgroovie/woodright-backend",
                    "tag": f"mutable-sha-{sha}",
                    "mutable": True,
                },
            )

    # Image build profile evidence (ops/config/image-build-profiles/*.conf via
    # scripts/release/resolve-image-build-profile.cjs). Non-secret only - the
    # publishable key is deliberately excluded from baked_storefront_values.
    build_profile = os.environ.get("BUILD_PROFILE") or None
    profile_checksum = os.environ.get("PROFILE_CHECKSUM") or None
    baked_storefront_values = None
    if build_profile:
        baked_storefront_values = {
            "NEXT_PUBLIC_SITE_URL": os.environ.get("BAKED_NEXT_PUBLIC_SITE_URL", ""),
            "NEXT_PUBLIC_MEDUSA_BACKEND_URL": os.environ.get("BAKED_NEXT_PUBLIC_MEDUSA_BACKEND_URL", ""),
            "WOODRIGHT_LAUNCH_MODE": os.environ.get("BAKED_WOODRIGHT_LAUNCH_MODE", ""),
            "WOODRIGHT_PAYMENT_MODE": os.environ.get("BAKED_WOODRIGHT_PAYMENT_MODE", ""),
            "WOODRIGHT_RUNTIME_ROLE": os.environ.get("BAKED_WOODRIGHT_RUNTIME_ROLE", ""),
            "WOODRIGHT_RUNTIME_EXPOSURE": os.environ.get("BAKED_WOODRIGHT_RUNTIME_EXPOSURE", ""),
            "WOODRIGHT_DB_ALIAS": os.environ.get("BAKED_WOODRIGHT_DB_ALIAS", ""),
            "WOODRIGHT_ADMIN_EXPOSURE": os.environ.get("BAKED_WOODRIGHT_ADMIN_EXPOSURE", ""),
        }
    # If this script runs, the workflow's contamination-gate and
    # launch-contract build-arg checks already succeeded (both fail closed
    # with `exit 1` earlier in the job) - so "pass" is the only truthful value
    # once a build_profile was actually resolved for this run.
    contamination_scan = "pass" if build_profile else "not_run"
    launch_contract = "pass" if build_profile else "not_run"

    if release_mode == "isolated_storefront":
        source_branch = os.environ["RELEASE_REF"]
        backend_revision = os.environ["BACKEND_REVISION"]
        backend_image = {
            "repository": "ghcr.io/saintgroovie/woodright-backend",
            "unique_tag": f"reused-{backend_revision[:12]}",
            "digest": be,
            "oci_revision": backend_revision,
            "reused": True,
        }
    else:
        source_branch = os.environ.get("GITHUB_REF_NAME") or os.environ.get("SOURCE_BRANCH") or "main"
        backend_image = {
            "repository": "ghcr.io/saintgroovie/woodright-backend",
            "unique_tag": unique,
            "digest": be,
            "oci_revision": sha,
        }

    doc = {
        "schema_version": "1",
        "source_sha": sha,
        "source_branch": source_branch,
        "workflow_name": os.environ.get("GITHUB_WORKFLOW") or "Build staging images",
        "workflow_run_id": run_id,
        "workflow_run_attempt": attempt,
        "event_name": os.environ.get("GITHUB_EVENT_NAME") or "workflow_dispatch",
        "actor": os.environ.get("GITHUB_ACTOR"),
        "build_started_at": started,
        "build_completed_at": completed,
        "backend": backend_image,
        "storefront": {
            "repository": "ghcr.io/saintgroovie/woodright-storefront",
            "unique_tag": unique,
            "digest": sf,
            "oci_revision": sha,
        },
        "convenience_aliases": aliases,
        "build_argument_names": arg_names,
        "build_config_fingerprint": fingerprint,
        "build_profile": build_profile,
        "profile_checksum": profile_checksum,
        "baked_storefront_values": baked_storefront_values,
        "contamination_scan": contamination_scan,
        "launch_contract": launch_contract,
        "tests_summary": None,
        "release_authorized": False,
        "notes": "Build artifact only. Deploy requires separate release manifest + digest pin.",
    }
    if release_mode == "isolated_storefront":
        doc["release_mode"] = "isolated_storefront"
        doc["production_base_sha"] = os.environ["PRODUCTION_BASE_SHA"]
        doc["production_storefront_digest"] = os.environ["PRODUCTION_STOREFRONT_DIGEST"]
        doc["main_sha"] = os.environ["MAIN_SHA"]
        doc["migration_count"] = 0
        doc["db_mutation"] = "forbidden"
        doc["storefront_delta_scope"] = "apps/storefront"
        doc["notes"] = (
            "Isolated storefront bake. Backend image was reused, not built. "
            "Candidate is not current main. Deploy requires a separate storefront-only cutover."
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
