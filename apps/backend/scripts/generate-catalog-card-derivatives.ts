/**
 * Generate catalog card WebP derivatives (~720w) under
 *   static/products/<collection>/derivatives/card/<basename>.webp
 *
 * Usage (from apps/backend):
 *   yarn generate:catalog-card-derivatives
 *   yarn generate:catalog-card-derivatives -- --limit=50
 *   yarn generate:catalog-card-derivatives -- --dry-run
 */
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const ROOT = path.resolve(process.cwd(), "static/products")
const CARD_WIDTH = 720
const QUALITY = 78
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"])

function parseArgs(argv: string[]) {
  let dryRun = false
  let limit = 0
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true
    const m = a.match(/^--limit=(\d+)$/)
    if (m) limit = Number(m[1])
  }
  return { dryRun, limit }
}

function walkImages(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    if (name === "derivatives" || name.startsWith(".")) continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      walkImages(full, out)
      continue
    }
    const ext = path.extname(name).toLowerCase()
    if (!IMAGE_EXT.has(ext)) continue
    out.push(full)
  }
  return out
}

function derivativePathFor(srcAbs: string): string {
  const rel = path.relative(ROOT, srcAbs)
  const dir = path.dirname(rel)
  const base = path.basename(rel, path.extname(rel))
  return path.join(ROOT, dir, "derivatives", "card", `${base}.webp`)
}

async function generateOne(
  srcAbs: string,
  destAbs: string,
  dryRun: boolean
): Promise<"wrote" | "skipped" | "error"> {
  try {
    if (fs.existsSync(destAbs)) {
      const srcStat = fs.statSync(srcAbs)
      const destStat = fs.statSync(destAbs)
      if (destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 0) {
        return "skipped"
      }
    }
    if (dryRun) return "wrote"
    fs.mkdirSync(path.dirname(destAbs), { recursive: true })
    await sharp(srcAbs)
      .rotate()
      .resize({
        width: CARD_WIDTH,
        height: CARD_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(destAbs)
    return "wrote"
  } catch (e) {
    console.error("fail", path.relative(ROOT, srcAbs), e)
    return "error"
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2))
  const all = walkImages(ROOT)
  const targets = limit > 0 ? all.slice(0, limit) : all
  console.log(
    JSON.stringify(
      {
        root: ROOT,
        found: all.length,
        targeting: targets.length,
        dryRun,
        cardWidth: CARD_WIDTH,
      },
      null,
      2
    )
  )

  let wrote = 0
  let skipped = 0
  let errors = 0
  const t0 = Date.now()
  for (const src of targets) {
    const dest = derivativePathFor(src)
    const result = await generateOne(src, dest, dryRun)
    if (result === "wrote") wrote++
    else if (result === "skipped") skipped++
    else errors++
    if ((wrote + skipped + errors) % 100 === 0) {
      console.log(
        `progress ${wrote + skipped + errors}/${targets.length} wrote=${wrote} skipped=${skipped} errors=${errors}`
      )
    }
  }
  console.log(
    JSON.stringify(
      {
        wrote,
        skipped,
        errors,
        ms: Date.now() - t0,
        sampleDest: targets[0]
          ? path.relative(ROOT, derivativePathFor(targets[0]!))
          : null,
      },
      null,
      2
    )
  )
  if (errors > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
