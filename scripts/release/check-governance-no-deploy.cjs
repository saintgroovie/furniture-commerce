#!/usr/bin/env node
/**
 * Static gate: build/PR workflows must not auto-deploy or mutate live Docker.
 */
const fs = require("fs")
const path = require("path")

const FORBIDDEN = [
  /\bdocker\s+(run|rm|stop|start|restart)\b/i,
  /\bdocker\s+compose\s+(up|down)\b/i,
  /\bdokploy\b.*\b(deploy|restart)\b/i,
  /\bmanual_flock_deploy\b/i,
  /\bkubectl\s+apply\b/i,
]

function scanFile(file, errors) {
  const text = fs.readFileSync(file, "utf8")
  for (const re of FORBIDDEN) {
    if (re.test(text)) errors.push(`${path.basename(file)}: forbidden deploy mutation pattern ${re}`)
  }
}

function main() {
  const root = process.argv[2] || ".github/workflows"
  const errors = []
  const files = fs.readdirSync(root).filter((f) => /\.ya?ml$/i.test(f))
  const writers = []
  for (const f of files) {
    const fp = path.join(root, f)
    const text = fs.readFileSync(fp, "utf8")
    if (/build-staging|pr-checks/i.test(f)) scanFile(fp, errors)
    if (/docker\/build-push-action|docker push/i.test(text)) {
      writers.push({ f, text })
    }
  }
  if (writers.length === 0) {
    console.log("OK no image writers (unexpected)")
  }
  for (const w of writers) {
    if (!/woodright\.tag\.namespace/i.test(w.text)) {
      errors.push(`${w.f}: image writer missing woodright.tag.namespace`)
    }
  }
  if (writers.length > 1) {
    const ns = writers.map((w) => {
      const m = w.text.match(/woodright\.tag\.namespace[=:\s]+([A-Za-z0-9._-]+)/)
      return m ? m[1] : null
    })
    const defined = ns.filter(Boolean)
    if (new Set(defined).size !== defined.length) {
      errors.push("duplicate woodright.tag.namespace across image writers")
    }
  }
  if (errors.length) {
    console.error("FAIL\n" + errors.join("\n"))
    process.exit(1)
  }
  console.log("OK governance-no-deploy + tag namespace ownership")
}

main()
