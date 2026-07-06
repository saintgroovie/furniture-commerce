#!/usr/bin/env node
/**
 * build-url-map.mjs — GUARDED SKELETON (логика не реализована).
 * schema_version: legacy-url-map v1
 *
 * Назначение (после реализации):
 *   вход:  <export-root>/raw/<site>/db/*.sql(.gz) — cscart_seo_names (локальный текст)
 *          и/или <export-root>/raw/<site>/admin-export/*
 *   выход: <export-root>/census/legacy-url-map.csv
 *
 * candidate_new_url / candidate_new_handle — только ПРЕДЛОЖЕНИЯ для operator
 * review; автоматического применения к Medusa/DNS/redirects нет и не будет.
 *
 * Safety contract: нет сети, нет DB-коннектов, DNS/Cloudflare не трогаются,
 * raw/ не изменяется, в repo не пишется ничего.
 * Скрипт намеренно завершается кодом 2 и НЕ притворяется успешным census.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPORT_BASE = "/Users/leonidmbp/Documents/woodright-legacy-private-export";

const SCHEMA = [
  "legacy_site", "old_url", "old_path", "entity_type",
  "legacy_product_id", "legacy_product_name", "legacy_category",
  "candidate_new_url", "candidate_new_handle", "redirect_priority",
  "evidence", "needs_operator_review",
];

function fail(msg, code = 1) {
  console.error(`[build-url-map] ERROR: ${msg}`);
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
  const sources = [];
  for (const site of sites) {
    for (const sub of ["db", "admin-export"]) {
      const dir = path.join(rawDir, site, sub);
      try {
        const files = await fs.readdir(dir);
        if (files.length > 0) sources.push({ site, sub, count: files.length });
      } catch {
        // директории может не быть — допустимо
      }
    }
  }
  if (sources.length === 0) {
    fail(`ни в одном raw/<site>/ нет непустых db/ или admin-export/ (raw: ${rawDir})`);
  }
  return { sources, outFile: path.join(exportRoot, "census", "legacy-url-map.csv") };
}

async function main() {
  const { sources, outFile } = await resolveExportPaths(process.argv.slice(2));
  console.error("[build-url-map] SKELETON_NOT_IMPLEMENTED — это каркас, а не рабочий url-map");
  for (const { site, sub, count } of sources) {
    console.log(`  вход [${site}/${sub}]: ${count} файлов`);
  }
  console.log(`  выход: ${outFile} (НЕ создан)`);
  console.log(`  схема v1 (${SCHEMA.length} колонок): ${SCHEMA.join(", ")}`);
  console.log("  TODO: parse cscart_seo_names из локального дампа (type p/c → product/category);");
  console.log("  TODO: derive legacy URLs (old_url/old_path/entity_type);");
  console.log("  TODO: propose candidate Medusa handles (только предложение, без apply);");
  console.log("  TODO: produce legacy-url-map.csv;");
  console.log("  TODO: redirect_priority консервативно (high только при точной связи с товаром);");
  console.log("  TODO: needs_operator_review=true везде, где confidence < 0.8.");
  process.exit(2);
}

main().catch((err) => fail(err?.message ?? String(err)));
