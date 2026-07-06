#!/usr/bin/env node
/**
 * build-media-census.mjs — GUARDED SKELETON (логика не реализована).
 * schema_version: legacy-media-census v1
 *
 * Назначение (после реализации):
 *   вход:  <export-root>/census/files-inventory.csv (от scan-files.mjs)
 *          <export-root>/raw/<site>/files/** (только чтение)
 *          <export-root>/raw/<site>/db/*.sql(.gz) — локальный текст, без DB-коннектов
 *   выход: <export-root>/census/legacy-media-census.csv
 *
 * Safety contract: нет сети, нет БД-подключений, raw/ не изменяется,
 * в repo не пишется ничего, credentials не принимаются, Medusa apply нет.
 * Скрипт намеренно завершается кодом 2 и НЕ притворяется успешным census.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPORT_BASE = "/Users/leonidmbp/Documents/woodright-legacy-private-export";

const SCHEMA = [
  "legacy_site", "legacy_file_path", "legacy_public_url_guess", "filename", "extension",
  "width", "height", "size_bytes", "sha256", "image_kind_guess",
  "used_in_db", "used_in_html",
  "legacy_product_id", "legacy_product_slug", "legacy_product_url", "legacy_product_name",
  "legacy_category", "legacy_collection",
  "is_main_image", "is_gallery_image", "sort_order", "alt_text", "title_text",
  "candidate_new_handle", "candidate_confidence", "evidence", "needs_operator_review",
];

// Консервативная шкала (см. README): <0.8 => needs_operator_review=true.
const CONFIDENCE_SCALE = {
  db_product_image_relation: 0.9,
  admin_export_column: 0.8,
  html_img_on_product_page: 0.75,
  article_slug_or_folder_match: 0.5,
  fuzzy_name_match: 0.3,
  no_relation_found: 0.0,
};

function fail(msg, code = 1) {
  console.error(`[build-media-census] ERROR: ${msg}`);
  process.exit(code);
}

async function resolveExportPaths(argv) {
  const dateArgIdx = argv.indexOf("--date");
  const date = dateArgIdx !== -1 ? argv[dateArgIdx + 1] : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("требуется --date YYYY-MM-DD");
  const exportRoot = path.resolve(EXPORT_BASE, date);
  if (path.dirname(exportRoot) !== EXPORT_BASE) fail(`путь вне разрешённой базы: ${exportRoot}`);
  const rawDir = path.join(exportRoot, "raw");
  try {
    await fs.access(rawDir);
  } catch {
    fail(`raw/ не найдена: ${rawDir}. Экспорт ещё не скачан оператором.`);
  }
  const inventory = path.join(exportRoot, "census", "files-inventory.csv");
  try {
    await fs.access(inventory);
  } catch {
    fail(`не найден ${inventory}. Сначала запустите scan-files.mjs --date ${date}.`);
  }
  return { inventory, outFile: path.join(exportRoot, "census", "legacy-media-census.csv") };
}

async function main() {
  const { inventory, outFile } = await resolveExportPaths(process.argv.slice(2));
  console.error("[build-media-census] SKELETON_NOT_IMPLEMENTED — это каркас, а не рабочий census");
  console.log(`  вход:  ${inventory}`);
  console.log(`  выход: ${outFile} (НЕ создан)`);
  console.log(`  схема v1 (${SCHEMA.length} колонок): ${SCHEMA.join(", ")}`);
  console.log(`  confidence scale: ${JSON.stringify(CONFIDENCE_SCALE)}`);
  console.log("  TODO: parse files-inventory (только image-строки);");
  console.log("  TODO: extract article code hints из filename (ol-14-1-… → OL-14-1, hint, не 1.0);");
  console.log("  TODO: parse local CS-Cart dump как текст (cscart_images, cscart_images_links);");
  console.log("  TODO: detect direct DB product↔image relations (evidence: db_product_image_relation, 0.9);");
  console.log("  TODO: detect gallery relations (evidence: db_product_gallery_relation);");
  console.log("  TODO: assign role hints (is_main_image / is_gallery_image / image_kind_guess);");
  console.log("  TODO: produce legacy-media-census.csv;");
  console.log("  TODO: все строки с confidence < 0.8 → needs_operator_review=true.");
  process.exit(2);
}

main().catch((err) => fail(err?.message ?? String(err)));
