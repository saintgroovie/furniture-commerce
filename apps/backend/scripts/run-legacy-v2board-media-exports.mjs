#!/usr/bin/env node
/**
 * Pre-bootstrap guard for apply-legacy-v2board-media-exports.
 *
 * Runs before medusa exec / Postgres bootstrap.
 * Blocks --apply without LEGACY_V2BOARD_APPLY_CONFIRM=1 immediately — no DB connection required.
 * If the guard passes, spawns: medusa exec ./src/scripts/apply-legacy-v2board-media-exports.ts <args>
 */

import { spawnSync } from "node:child_process"

const args = process.argv.slice(2)

if (args.includes("--apply") && process.env.LEGACY_V2BOARD_APPLY_CONFIRM !== "1") {
  process.stderr.write(
    "refusing --apply without LEGACY_V2BOARD_APPLY_CONFIRM=1\n" +
      "  Example: LEGACY_V2BOARD_APPLY_CONFIRM=1 yarn legacy-v2board-media:dry-run -- \\\n" +
      "    --apply --export tmp/qa-screenshots/manual-triage-export-co-08-1-fixed.json\n"
  )
  process.exit(1)
}

const result = spawnSync(
  "medusa",
  ["exec", "./src/scripts/apply-legacy-v2board-media-exports.ts", ...args],
  { stdio: "inherit", shell: true }
)

process.exit(result.status ?? 1)
