#!/usr/bin/env node
/** Tools runner security policy validator (digest-pinned, no docker.sock). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const image = doc.image || ""
  const APPROVED = "6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3"
  if (!/@sha256:[0-9a-f]{64}/.test(image) || /:(latest|stable|main|master)\b/.test(image.split("@")[0] || "")) {
    errors.push("mutable tools image rejected")
  }
  const m = /@sha256:([0-9a-f]{64})/.exec(image)
  if (!m || m[1] !== APPROVED) {
    errors.push("tools image digest not in allowlist")
  }
  if (doc.privileged === true) errors.push("privileged rejected")
  if (doc.docker_socket_mount === true) errors.push("Docker socket mount rejected")
  if (doc.writable_repo_mount === true) errors.push("writable repository mount rejected")
  if (doc.read_only !== true) errors.push("read_only required")
  if (doc.network_mode === "host") errors.push("host network rejected")
  if (doc.network_mode && doc.network_mode !== "none" && doc.network_mode !== "dokploy-network") {
    errors.push("invalid network mode")
  }
  return { ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = evaluate(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-tools-runner-policy.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK tools runner policy")
}

main()
