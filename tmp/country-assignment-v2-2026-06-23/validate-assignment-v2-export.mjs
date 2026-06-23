#!/usr/bin/env node
/**
 * QA-only validation for Country assignment_v2 gated apply.
 * Usage: node tmp/country-assignment-v2-2026-06-23/validate-assignment-v2-export.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
const EXPORT_PATH = path.join(__dirname, "operator-assignment-v2-export.json")
const OUT_PATH = path.join(__dirname, "validation-report.json")

const WHITELIST = [
  "co-05-1",
  "co-02-1",
  "co-08-1",
  "co-14-2",
  "co-15-2",
  "co-61-1",
  "co-62-1",
  "co-62-2",
  "co-62-3",
  "co-65-1",
  "co-65-2",
  "co-66-1",
  "co-69-1",
]
const WHITELIST_SET = new Set(WHITELIST)
const COLLECTION = "country-london-paris"

const ALLOWED_SOURCE_PREFIXES = [
  "apps/backend/static/products/country-london-paris/",
  "data/raw/downloaded-assets/country-london-paris/",
  "data/raw/pdf-assets/extracted/Country/",
]

const KNOWN_ROLES = new Set([
  "front_anfas",
  "front_3_4",
  "interior",
  "lifestyle",
  "other",
  "detail",
  "scheme",
  "closed_front",
  "hero_front",
])

function normPath(p) {
  return String(p || "").replace(/\\/g, "/")
}

function isAllowedSource(sp) {
  const n = normPath(sp)
  return ALLOWED_SOURCE_PREFIXES.some((prefix) => n.startsWith(prefix))
}

function classifyRole(slot) {
  if (KNOWN_ROLES.has(slot)) {
    if (["detail", "scheme", "closed_front", "hero_front"].includes(slot)) return "other"
    return slot
  }
  return "other"
}

function main() {
  const errors = []
  const warnings = []
  let payload

  try {
    payload = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"))
  } catch (e) {
    errors.push(`JSON parse failed: ${e.message}`)
    writeReport(false, errors, warnings, null)
    process.exit(1)
  }

  if (payload.export_kind !== "assignment_v2") {
    errors.push(`export_kind must be assignment_v2, got ${payload.export_kind}`)
  }
  if (payload.media_ops_handoff !== true) {
    errors.push("media_ops_handoff must be true")
  }
  if (payload.do_not_auto_apply !== true) {
    warnings.push("do_not_auto_apply is not true on envelope (gated apply still requires explicit confirm)")
  }

  const assignment = payload.assignment
  if (!assignment || typeof assignment !== "object") {
    errors.push("assignment subtree missing")
    writeReport(false, errors, warnings, null)
    process.exit(1)
  }

  const review = assignment.review_meta || {}
  if (review.scope !== "legacy_media_assignment_board") {
    errors.push(`review_meta.scope must be legacy_media_assignment_board, got ${review.scope}`)
  }
  if (review.board_version !== "v2board") {
    errors.push(`review_meta.board_version must be v2board, got ${review.board_version}`)
  }

  const assignments = assignment.assignments || {}
  const handles = Object.keys(assignments).sort()
  const handleSet = new Set(handles)

  if (handles.length !== WHITELIST.length) {
    errors.push(`handle count ${handles.length} !== whitelist ${WHITELIST.length}`)
  }
  for (const h of WHITELIST) {
    if (!handleSet.has(h)) errors.push(`missing whitelist handle: ${h}`)
  }
  for (const h of handles) {
    if (!WHITELIST_SET.has(h)) errors.push(`handle outside whitelist: ${h}`)
  }

  let countedMain = 0
  let countedGallery = 0
  const perHandle = {}
  const sourcePathTypes = { backend_static_mapped: 0, local_proxy: 0 }
  const roleCounts = {
    front_anfas: 0,
    front_3_4: 0,
    interior: 0,
    lifestyle: 0,
    other: 0,
  }

  for (const handle of handles) {
    const product = assignments[handle]
    if (product.collection !== COLLECTION) {
      errors.push(`${handle}: collection must be ${COLLECTION}, got ${product.collection}`)
    }

    const variants = product.variants || {}
    const variantKeys = Object.keys(variants)
    const per = { variant_count: variantKeys.length, main_count: 0, gallery_count: 0 }

    const mediaIdsForProduct = new Set()
    const collectId = (ref) => {
      if (ref?.id) mediaIdsForProduct.add(ref.id)
    }

    for (const vk of variantKeys) {
      const v = variants[vk]
      if (!v.main) {
        errors.push(`${handle}/${vk}: missing main`)
      } else {
        per.main_count++
        countedMain++
        for (const field of ["id", "filename", "source_path"]) {
          if (!v.main[field]) errors.push(`${handle}/${vk}/main: missing ${field}`)
        }
        if (v.main.source_path && !isAllowedSource(v.main.source_path)) {
          errors.push(`${handle}/${vk}/main: disallowed source_path ${v.main.source_path}`)
        }
        if (v.main.preview_status === "backend_static_mapped") sourcePathTypes.backend_static_mapped++
        if (v.main.preview_status === "local_proxy") sourcePathTypes.local_proxy++
        collectId(v.main)
      }

      const mainId = v.main?.id
      const gallery = v.gallery || []
      per.gallery_count += gallery.length
      countedGallery += gallery.length

      const mainIdsInVariant = new Set()
      if (mainId) mainIdsInVariant.add(mainId)

      for (const [gi, item] of gallery.entries()) {
        for (const field of ["id", "filename", "source_path"]) {
          if (!item[field]) errors.push(`${handle}/${vk}/gallery[${gi}]: missing ${field}`)
        }
        if (item.source_path && !isAllowedSource(item.source_path)) {
          errors.push(`${handle}/${vk}/gallery[${gi}]: disallowed source_path ${item.source_path}`)
        }
        if (item.preview_status === "backend_static_mapped") sourcePathTypes.backend_static_mapped++
        if (item.preview_status === "local_proxy") sourcePathTypes.local_proxy++
        collectId(item)
        if (mainIdsInVariant.has(item.id)) {
          warnings.push(`${handle}/${vk}: gallery item duplicates main id ${item.id} (may be intentional reuse)`)
        }
      }

      const roles = v.role_assignments || {}
      for (const [slot, ref] of Object.entries(roles)) {
        const bucket = classifyRole(slot)
        roleCounts[bucket] = (roleCounts[bucket] || 0) + 1
        if (!ref?.id) {
          errors.push(`${handle}/${vk}/role_assignments/${slot}: missing id`)
          continue
        }
        if (!mediaIdsForProduct.has(ref.id)) {
          errors.push(`${handle}/${vk}/role_assignments/${slot}: id ${ref.id} not in product main/gallery`)
        }
      }
    }

      const edits = product.operator_variant_edits
    if (edits?.default_variant_key && !variants[edits.default_variant_key]) {
      errors.push(
        `${handle}: default_variant_key ${edits.default_variant_key} not in variants`
      )
    }

    if (variants.cream) {
      const milkLabel = variants.cream.operator_variant_label
      if (!milkLabel || milkLabel !== "Молочный") {
        errors.push(
          `${handle}/cream: operator_variant_label must be «Молочный», got ${milkLabel ?? "missing"}`
        )
      }
    }

    const milkKeys = ["cream", "milk", "molochny"].filter((k) => variants[k])
    if (milkKeys.length > 0) {
      const defaultKey = product.operator_variant_edits?.default_variant_key
      if (defaultKey && !milkKeys.includes(defaultKey)) {
        warnings.push(
          `${handle}: default_variant_key ${defaultKey} is not milk-like; expected one of ${milkKeys.join(", ")}`
        )
      } else if (!defaultKey) {
        warnings.push(
          `${handle}: missing default_variant_key for milk-like variant (${milkKeys.join(", ")})`
        )
      }
    }

    perHandle[handle] = per
  }

  const summary = assignment.summary || {}
  if (summary.products_with_assignments !== 13) {
    errors.push(`summary.products_with_assignments ${summary.products_with_assignments} !== 13`)
  }
  if (summary.total_main_assignments !== countedMain) {
    errors.push(`main count mismatch: summary ${summary.total_main_assignments} vs counted ${countedMain}`)
  }
  if (summary.total_main_assignments !== 48) {
    errors.push(`summary.total_main_assignments ${summary.total_main_assignments} !== 48`)
  }
  if (summary.total_gallery_items !== countedGallery) {
    errors.push(`gallery count mismatch: summary ${summary.total_gallery_items} vs counted ${countedGallery}`)
  }
  if (summary.total_gallery_items !== 55) {
    errors.push(`summary.total_gallery_items ${summary.total_gallery_items} !== 55`)
  }

  const pass = errors.length === 0
  writeReport(pass, errors, warnings, {
    generated_at: payload.generated_at,
    collection: COLLECTION,
    products_with_assignments: handles.length,
    total_main_assignments: countedMain,
    total_gallery_items: countedGallery,
    whitelist_handles: WHITELIST,
    per_handle: perHandle,
    source_path_types_count: sourcePathTypes,
    role_counts: roleCounts,
  })
  process.exit(pass ? 0 : 1)
}

function writeReport(pass, errors, warnings, summaryStats) {
  const report = {
    validated_at: new Date().toISOString(),
    export_path: EXPORT_PATH,
    pass,
    errors,
    warnings,
    summary_stats: summaryStats,
  }
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ pass, errors: errors.length, warnings: warnings.length, out: OUT_PATH }, null, 2))
}

main()
