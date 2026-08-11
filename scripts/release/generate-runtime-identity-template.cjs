#!/usr/bin/env node
/**
 * Emit template runtime identity JSON (no live container IDs required).
 * Live ACTIVE_PUBLIC is written on the VM from Traefik + docker inspect.
 */
const { SCHEMA_VERSION } = require("./runtime-identity-lib.cjs")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

const role = arg("--role", "public_demo")
const now = new Date().toISOString()

const templates = {
  public_demo: {
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "public",
    environment_label: "public_demo",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://api.woodright-demo.ru",
    release_sha: arg("--release-sha", ""),
    backend_image_digest: arg("--backend-digest", ""),
    storefront_image_digest: arg("--storefront-digest", ""),
    backend_container: "woodright-staging-backend",
    storefront_container: "woodright-staging-storefront",
    database_identity: "woodright_staging",
    database_identity_alias: "public_demo_db",
    deployment_owner: arg("--owner", "Dokploy"),
    traefik_router: arg("--traefik-router", "woodright-demo"),
    traefik_service: arg("--traefik-service", "woodright-staging-backend"),
    legacy_container_family: "woodright-staging-*",
    generated_at: now,
  },
  non_public_candidate: {
    schema_version: SCHEMA_VERSION,
    runtime_role: "non_public_candidate",
    exposure: "private",
    environment_label: "non_public_candidate",
    canonical_domain: "none",
    canonical_api_origin: "none",
    release_sha: arg("--release-sha", ""),
    backend_image_digest: arg("--backend-digest", ""),
    storefront_image_digest: arg("--storefront-digest", ""),
    backend_container: "woodright-production-backend",
    storefront_container: "woodright-production-storefront",
    database_identity: "woodright_production",
    database_identity_alias: "non_public_candidate_db",
    deployment_owner: arg("--owner", "manual/unassigned"),
    traefik_router: "none",
    traefik_service: "none",
    local_debug_endpoint: "127.0.0.1:9200",
    legacy_container_family: "woodright-production-*",
    generated_at: now,
  },
}

if (!templates[role]) {
  console.error("role must be public_demo|non_public_candidate")
  process.exit(2)
}

process.stdout.write(JSON.stringify(templates[role], null, 2) + "\n")
