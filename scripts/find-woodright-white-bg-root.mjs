#!/usr/bin/env node
/**
 * Read-only discovery of local WOODRIGHT / Yandex "Фото на белом фоне" style roots on macOS.
 * Does not modify Medusa, seed, evidence, catalog-scope, or copy images.
 *
 * Usage (repo root):
 *   node scripts/find-woodright-white-bg-root.mjs
 *   node scripts/find-woodright-white-bg-root.mjs --run-expansion
 *
 * Writes:
 *   data/normalized/woodright-white-bg-root-discovery.json
 *   docs/project/woodright-white-bg-root-discovery.md
 */

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

/** Match Oxford-related media by path/filename (aligned with expand script SKU tokens). */
const OXFORD_REL_RE =
  /\b(OX-\d{2,3}-\d{1,2}|S-OX-\d{2,3}|SH-\d{2,3}-\d{1,2}|MC-OX-\d{2,3}-\d+)\b|oxford|оксфорд/i

const MDFIND_QUERY = [
  'kMDItemFSName == "WOODRIGHT"c',
  'kMDItemFSName == "Фото на белом фоне"c',
  'kMDItemFSName == "Контент"c',
  'kMDItemFSName == "Yandex"c',
  'kMDItemFSName == "Yandex Disk"c',
  'kMDItemFSName == "Yandex.Disk"c',
].join(" || ")

function isDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function runMdfind() {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "not_darwin", lines: [] }
  }
  const r = spawnSync("mdfind", [MDFIND_QUERY], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 25000,
  })
  if (r.error && (r.error.code === "ENOENT" || r.signal === "ETIMEDOUT")) {
    return { ok: false, reason: String(r.error?.code || r.signal), lines: [] }
  }
  const stderr = (r.stderr || "").trim()
  if (r.status !== 0 && stderr) {
    return { ok: false, reason: `mdfind_exit_${r.status}`, lines: [], stderr }
  }
  const lines = (r.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
  return { ok: true, lines }
}

const FIND_DIR_NAMES = [
  "WOODRIGHT",
  "Yandex.Disk",
  "Yandex Disk",
  "YandexDisk",
  "Yandex",
  "Фото на белом фоне",
  "Контент",
]

/** Spotlight often returns Yandex *app support* — not the Disk mount. */
function isProbablyYandexAppSupportOnly(abs) {
  return /[/\\]Application Support[/\\]Yandex$/i.test(abs)
}

function buildFindGroupedInameArgs() {
  const args = ["(", "-iname", FIND_DIR_NAMES[0]]
  for (let i = 1; i < FIND_DIR_NAMES.length; i++) {
    args.push("-o", "-iname", FIND_DIR_NAMES[i])
  }
  args.push(")")
  return args
}

/** One bounded `find` from a single root (grouped `-iname … -o …`). */
function runFindFromRoot(root, maxdepth, timeoutMs = 90000) {
  if (!root || !fs.existsSync(root)) return []
  const args = [root, "-maxdepth", String(maxdepth), "-type", "d", ...buildFindGroupedInameArgs()]
  const r = spawnSync("find", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  })
  const out = []
  if (r.stdout) {
    for (const line of r.stdout.split("\n")) {
      const t = line.trim()
      if (t) out.push(path.normalize(t))
    }
  }
  return out
}

/**
 * Avoid one giant `find` across all of `~/Library/CloudStorage` (can take minutes on iCloud-heavy Macs).
 * Instead: one bounded find per immediate child provider folder.
 */
function listCloudStorageProviderRoots(home) {
  const cs = home ? path.join(home, "Library", "CloudStorage") : null
  if (!cs || !fs.existsSync(cs)) return []
  try {
    return fs
      .readdirSync(cs)
      .map((n) => path.join(cs, n))
      .filter((p) => {
        try {
          return fs.statSync(p).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return []
  }
}

/** Collect directory-name hits via bounded find (no full-tree BFS of $HOME). */
function runFind() {
  const home = process.env.HOME || ""
  const found = new Set()
  const providers = listCloudStorageProviderRoots(home).slice(0, 10)
  for (const p of providers) {
    for (const line of runFindFromRoot(p, 8, 12000)) found.add(line)
  }
  if (home) {
    for (const line of runFindFromRoot(home, 5, 25000)) found.add(line)
  }
  for (const line of runFindFromRoot("/Volumes", 10, 30000)) found.add(line)
  return [...found]
}

function getPathsSearchedMeta(home) {
  const providersAll = listCloudStorageProviderRoots(home)
  const providers = providersAll.slice(0, 10)
  return {
    mdfind: process.platform === "darwin" ? "mdfind (Spotlight)" : "skipped_not_darwin",
    mdfind_query: MDFIND_QUERY,
    find_commands: [
      {
        kind: "cloud_storage_per_provider",
        provider_roots_scanned: providers,
        provider_roots_total: providersAll.length,
        maxdepth: 8,
        timeout_ms_per_find: 12000,
        directory_name_predicates: FIND_DIR_NAMES,
      },
      home
        ? {
            kind: "home_bounded",
            root: home,
            maxdepth: 5,
            timeout_ms: 25000,
            directory_name_predicates: FIND_DIR_NAMES,
          }
        : null,
      {
        kind: "volumes_bounded",
        root: "/Volumes",
        maxdepth: 10,
        timeout_ms: 30000,
        directory_name_predicates: FIND_DIR_NAMES,
      },
    ].filter(Boolean),
    note: "CloudStorage: up to 10 immediate child folders under ~/Library/CloudStorage, each with its own bounded find (timeouts avoid multi-minute hangs on huge cloud mirrors).",
  }
}

function looksLikeWhiteBgRoot(abs) {
  const n = abs.normalize("NFC").toLowerCase()
  const hasWood = n.includes("woodright")
  const hasPhoto = n.includes("фото на белом фоне")
  const hasContent = n.includes("контент")
  return hasWood && hasPhoto && hasContent
}

function walkOxfordImages(root, maxDepth, maxFiles) {
  const samples = []
  let count = 0
  let scannedFiles = 0
  const walk = (dir, depth) => {
    if (depth > maxDepth || scannedFiles >= maxFiles) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (scannedFiles >= maxFiles) return
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full, depth + 1)
      } else if (ent.isFile()) {
        scannedFiles++
        const ext = path.extname(ent.name).toLowerCase()
        if (!IMAGE_EXT.has(ext)) continue
        const rel = path.relative(root, full)
        const hay = `${rel}/${ent.name}`
        if (OXFORD_REL_RE.test(hay) || OXFORD_REL_RE.test(ent.name)) {
          count++
          if (samples.length < 20) samples.push(full)
        }
      }
    }
  }
  if (isDir(root)) walk(root, 0)
  return { count, samples, scannedFiles }
}

function recommend(abs, oxfordCount, whiteBgLikely) {
  if (whiteBgLikely && oxfordCount > 0) return "use_as_WOODRIGHT_WHITE_BG_ROOT"
  if (whiteBgLikely) return "use_as_WOODRIGHT_WHITE_BG_ROOT"
  if (oxfordCount > 0 && /woodright/i.test(abs)) return "maybe_parent_root"
  if (oxfordCount > 0) return "maybe_parent_root"
  return "not_relevant"
}

function pickExpansionEnv(rows) {
  const useAs = rows.filter((r) => r.recommendation === "use_as_WOODRIGHT_WHITE_BG_ROOT" && r.exists)
  const maybe = rows
    .filter((r) => r.recommendation === "maybe_parent_root" && r.exists && r.oxford_related_image_count > 0)
    .sort((a, b) => b.oxford_related_image_count - a.oxford_related_image_count)

  const useAsStrong = rows.filter(
    (r) => r.recommendation === "use_as_WOODRIGHT_WHITE_BG_ROOT" && r.exists && looksLikeWhiteBgRoot(r.absolute_path)
  )
  if (useAsStrong.length === 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOT", value: useAsStrong[0].absolute_path, label: "single_confident_white_bg" }
  }
  if (useAsStrong.length > 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOTS", value: useAsStrong.map((r) => r.absolute_path).join(":"), label: "multi_confident_white_bg" }
  }
  if (useAs.length === 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOT", value: useAs[0].absolute_path, label: "single_white_bg_path" }
  }
  if (useAs.length > 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOTS", value: useAs.map((r) => r.absolute_path).join(":"), label: "multi_white_bg_path" }
  }
  if (maybe.length === 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOT", value: maybe[0].absolute_path, label: "single_maybe_parent" }
  }
  if (maybe.length > 1) {
    return { mode: "WOODRIGHT_WHITE_BG_ROOTS", value: maybe.slice(0, 6).map((r) => r.absolute_path).join(":"), label: "multi_maybe_parent" }
  }
  return null
}

function main() {
  const runExpansion = process.argv.includes("--run-expansion")
  const generatedAt = new Date().toISOString()
  const home = process.env.HOME || ""

  const pathsSearched = getPathsSearchedMeta(home)

  const rawCandidates = new Set()
  const mdf = runMdfind()
  for (const line of mdf.lines || []) {
    if (isProbablyYandexAppSupportOnly(line)) continue
    try {
      const st = fs.statSync(line)
      if (st.isDirectory()) rawCandidates.add(path.normalize(line))
      else if (st.isFile()) rawCandidates.add(path.normalize(path.dirname(line)))
    } catch {
      /* ignore */
    }
  }
  for (const p of runFind()) rawCandidates.add(path.normalize(p))

  /** Drop Yandex macOS app-support hits (not Yandex.Disk mount). */
  const sorted = [...rawCandidates]
    .filter((p) => !isProbablyYandexAppSupportOnly(p))
    .sort((a, b) => a.length - b.length)

  const candidates = []
  for (const absolute_path of sorted) {
    const exists = isDir(absolute_path)
    const whiteBgLikely = looksLikeWhiteBgRoot(absolute_path)
    const { count, samples, scannedFiles } = exists ? walkOxfordImages(absolute_path, 6, 20000) : { count: 0, samples: [], scannedFiles: 0 }
    const recommendation = recommend(absolute_path, count, whiteBgLikely)
    candidates.push({
      absolute_path,
      exists,
      oxford_related_image_count: count,
      sample_files: samples,
      scanned_files_cap: scannedFiles,
      recommendation,
      white_bg_path_heuristic: whiteBgLikely,
    })
  }

  const picked = pickExpansionEnv(candidates)
  let expansion = {
    ran: false,
    skipped_reason: null,
    command: null,
    exit_code: null,
  }

  if (runExpansion) {
    if (!picked) {
      expansion.skipped_reason = "no_suitable_root_for_auto_expansion"
    } else {
      const env = { ...process.env, [picked.mode]: picked.value }
      const script = path.join(REPO, "scripts", "expand-oxford-media-source-inventory.mjs")
      expansion.command = `${picked.mode}="${picked.value}" node scripts/expand-oxford-media-source-inventory.mjs`
      const r = spawnSync(process.execPath, [script], { cwd: REPO, env, stdio: "inherit" })
      expansion.ran = true
      expansion.exit_code = r.status ?? null
    }
  }

  const verdict =
    candidates.some((c) => c.recommendation !== "not_relevant" && c.exists)
      ? "candidates_found"
      : "no_woodright_white_bg_root_found"

  const jsonOut = {
    audit_meta: {
      pass_name: "woodright_white_bg_root_discovery",
      pass_kind: "read_only_local_filesystem_probe",
      generated_at: generatedAt,
      generated_by: "scripts/find-woodright-white-bg-root.mjs",
      platform: process.platform,
      verdict,
      paths_searched: pathsSearched,
      mdfind: mdf,
      expansion,
      next_steps_if_not_found: [
        "Yandex/WOODRIGHT source not found on local filesystem.",
        "Likely causes: Yandex Disk not installed, not logged in, not synced, or folder is online-only.",
        "Open Yandex Disk app or Finder, ensure WOODRIGHT / «Фото на белом фоне» is available offline, then re-run this script.",
      ],
    },
    candidates,
    auto_expansion_pick: picked,
  }

  const jsonPath = path.join(REPO, "data/normalized/woodright-white-bg-root-discovery.json")
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + "\n", "utf8")

  const mdLines = [
    "# WOODRIGHT / white-background root discovery",
    "",
    `Generated: **${generatedAt.slice(0, 19)}** by \`scripts/find-woodright-white-bg-root.mjs\`.`,
    "",
    "## Verdict",
    "",
    `**${verdict}**`,
    "",
  ]
  if (verdict === "no_woodright_white_bg_root_found") {
    mdLines.push("### If the Yandex / WOODRIGHT tree is missing", "")
    for (const s of jsonOut.audit_meta.next_steps_if_not_found) mdLines.push(`- ${s}`)
    mdLines.push("")
  }
  mdLines.push(
    "## Paths probed",
    "",
    "- Spotlight: `mdfind` with folder-name predicates (macOS only).",
    `- Bounded \`find -type d -iname …\` under each configured root (see JSON \`paths_searched.find_commands\`).`,
    "",
    "## Candidates",
    "",
    "| Path | Exists | Oxford-ish images | Recommendation |",
    "|------|-------:|------------------:|----------------|",
  )
  for (const c of candidates.slice(0, 80)) {
    mdLines.push(
      `| \`${c.absolute_path.replace(/\|/g, "\\|")}\` | ${c.exists ? "yes" : "no"} | ${c.oxford_related_image_count} | ${c.recommendation} |`
    )
  }
  if (candidates.length > 80) mdLines.push("", `_… ${candidates.length - 80} additional rows in JSON only._`)
  mdLines.push(
    "",
    "## Sample files (first candidate with samples)",
    "",
    "```",
    String(candidates.find((c) => c.sample_files?.length)?.sample_files.join("\n") || "(none)"),
    "```",
    "",
    "## Expansion",
    "",
    picked
      ? `- Auto-pick: **${picked.label}** — \`${picked.mode}\` set for \`expand-oxford-media-source-inventory.mjs\`.`
      : "- No auto-pick for expansion (no confident white-bg root and no Oxford-rich parent).",
    "",
    runExpansion
      ? expansion.ran
        ? `- **Ran** expansion (exit ${expansion.exit_code}).`
        : `- **Did not run** expansion: ${expansion.skipped_reason || "n/a"}.`
      : "- Re-run with `--run-expansion` after verifying a path.",
    "",
    "## Safety",
    "",
    "Read-only discovery; no DB, seed, evidence, catalog-scope, or image copy. JSON/MD are governance artifacts only.",
    ""
  )
  const mdPath = path.join(REPO, "docs/project/woodright-white-bg-root-discovery.md")
  fs.writeFileSync(mdPath, mdLines.join("\n"), "utf8")

  console.log("Wrote", jsonPath)
  console.log("Wrote", mdPath)
  console.log("Verdict:", verdict, "| candidates:", candidates.length)
  if (picked) console.log("Auto-pick:", picked.label, picked.mode, "=", picked.value)
}

main()
