#!/usr/bin/env node
/**
 * Link medusa build admin output (dist/public/admin) → public/admin for medusa start.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const src = path.join(root, "dist/public/admin")
const dest = path.join(root, "public/admin")

function main() {
  if (!fs.existsSync(path.join(src, "index.html"))) {
    console.error(
      `[link-admin-build] missing ${src}/index.html — run "npm run build" first`
    )
    process.exit(1)
  }

  fs.mkdirSync(path.join(root, "public"), { recursive: true })

  if (fs.existsSync(dest)) {
    const stat = fs.lstatSync(dest)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(dest)
    } else {
      fs.rmSync(dest, { recursive: true, force: true })
    }
  }

  const relative = path.relative(path.dirname(dest), src)
  fs.symlinkSync(relative, dest, "dir")
  console.log(`[link-admin-build] linked public/admin → ${relative}`)
}

main()
