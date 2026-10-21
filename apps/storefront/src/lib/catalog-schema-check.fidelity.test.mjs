import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"

const test = fileURLToPath(new URL("../../scripts/catalog-schema-check.test.py", import.meta.url))
const result = spawnSync("python3", [test], { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } })
assert.equal(result.status, 0, "Public catalog schema regression fixtures")
