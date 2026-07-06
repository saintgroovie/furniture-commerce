#!/usr/bin/env node
/**
 * build-product-census.mjs — GUARDED SKELETON (логика не реализована).
 * schema_version: legacy-products-census v1
 *
 * Назначение (после реализации):
 *   вход:  <export-root>/raw/<site>/db/*.sql | *.sql.gz — локальный CS-Cart dump,
 *          парсится как текст/stream; подключений к живой БД НЕТ и не будет.
 *   выход: <export-root>/census/legacy-products-census.csv
 *
 * Safety contract: нет сети, нет DB-коннектов, raw/ не изменяется,
 * в repo не пишется ничего, в БД не пишется НИКОГДА, Medusa apply нет.
 * Скрипт намеренно завершается кодом 2 и НЕ притворяется успешным census.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPORT_BASE = "/Users/leonidmbp/Documents/woodright-legacy-private-export";

const SCHEMA = [
  "legacy_site", "legacy_product_id", "legacy_product_url", "legacy_product_slug",
  "legacy_product_name", "legacy_article", "legacy_sku",
  "legacy_category", "legacy_collection", "legacy_price", "legacy_dimensions", "legacy_status",
  "main_image_path", "gallery_image_paths",
  "candidate_new_medusa_handle", "candidate_new_classification",
  "candidate_confidence", "evidence", "needs_operator_review",
];

function fail(msg, code = 1) {
  console.error(`[build-product-census] ERROR: ${msg}`);
  process.exit(code);
}

async function resolveExportPaths(argv) {
  const dateArgIdx = argv.indexOf("--date");
  const date = dateArgIdx !== -1 ? argv[dateArgIdx + 1] : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("требуется --date YYYY-MM-DD");
  const exportRoot = path.resolve(EXPORT_BASE, date);
  if (path.dirname(exportRoot) !== EXPORT_BASE) fail(`путь вне разрешённой базы: ${exportRoot}`);
  const rawDir = path.join(exportRoot, "raw");
  let sites = [];
  try {
    sites = (await fs.readdir(rawDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== "meta")
      .map((e) => e.name);
  } catch {
    fail(`raw/ не найдена: ${rawDir}. Экспорт ещё не скачан оператором.`);
  }
  const dbDirs = [];
  for (const site of sites) {
    const dbDir = path.join(rawDir, site, "db");
    try {
      const dumps = (await fs.readdir(dbDir)).filter((f) => /\.sql(\.gz)?$/.test(f));
      if (dumps.length > 0) dbDirs.push({ site, dbDir, dumps });
    } catch {
      // у сайта нет db/ — допустимо, проверяем остальные
    }
  }
  if (dbDirs.length === 0) {
    fail(`ни в одном raw/<site>/db/ нет файлов *.sql / *.sql.gz (raw: ${rawDir})`);
  }
  return { dbDirs, outFile: path.join(exportRoot, "census", "legacy-products-census.csv") };
}

async function main() {
  const { dbDirs, outFile } = await resolveExportPaths(process.argv.slice(2));
  console.error("[build-product-census] SKELETON_NOT_IMPLEMENTED — это каркас, а не рабочий census");
  for (const { site, dumps } of dbDirs) {
    console.log(`  вход [${site}]: ${dumps.join(", ")}`);
  }
  console.log(`  выход: ${outFile} (НЕ создан)`);
  console.log(`  схема v1 (${SCHEMA.length} колонок): ${SCHEMA.join(", ")}`);
  console.log("  TODO: parse local SQL dump как text/stream (без загрузки в память целиком);");
  console.log("  TODO: read cscart_products (product_id, product_code, status);");
  console.log("  TODO: read cscart_product_descriptions (названия RU);");
  console.log("  TODO: read cscart_images_links (product↔image, evidence 0.9);");
  console.log("  TODO: read cscart_images (image_path);");
  console.log("  TODO: read cscart_seo_names (slug/url);");
  console.log("  TODO: build legacy product census (evidence обязателен в каждой строке);");
  console.log("  TODO: never write to DB — только чтение локального текста дампа.");
  process.exit(2);
}

main().catch((err) => fail(err?.message ?? String(err)));
