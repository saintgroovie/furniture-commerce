#!/usr/bin/env node
/**
 * scan-files.mjs — локальная инвентаризация legacy-экспорта (read-only).
 * schema_version: files-inventory v1
 *
 * Safety contract:
 *   - читает ТОЛЬКО <export-root>/raw/**; файлы raw/ не изменяются;
 *   - пишет ТОЛЬКО <export-root>/census/files-inventory.csv;
 *   - никакой сети, никаких БД, никаких записей в repo;
 *   - архивы/SQL инвентаризируются (метаданные + sha256 потоково),
 *     содержимое не распаковывается и не парсится;
 *   - symlinks не разрешаются: строка со skipped=true, skip_reason=symlink.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPORT_BASE = "/Users/leonidmbp/Documents/woodright-legacy-private-export";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".avif", ".svg"]);
const SQL_EXTS = new Set([".sql"]);
const ARCHIVE_EXTS = new Set([".gz", ".zip", ".tar", ".7z"]);
const HTML_EXTS = new Set([".html", ".htm"]);
const DOC_EXTS = new Set([".csv", ".xlsx", ".xls", ".txt", ".md", ".json", ".xml"]);

function fail(msg) {
  console.error(`[scan-files] ERROR: ${msg}`);
  process.exit(1);
}

/** Guard: единственный допустимый корень — EXPORT_BASE/YYYY-MM-DD. */
async function resolveExportPaths(argv) {
  const dateArgIdx = argv.indexOf("--date");
  const date = dateArgIdx !== -1 ? argv[dateArgIdx + 1] : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail("требуется --date YYYY-MM-DD (path traversal и произвольные пути отклоняются)");
  }
  const exportRoot = path.resolve(EXPORT_BASE, date);
  if (path.dirname(exportRoot) !== EXPORT_BASE) {
    fail(`путь вне разрешённой базы: ${exportRoot}`);
  }
  const rawDir = path.join(exportRoot, "raw");
  try {
    const st = await fs.lstat(rawDir);
    if (!st.isDirectory()) fail(`${rawDir} не является директорией`);
  } catch {
    fail(`raw/ не найдена: ${rawDir}. Экспорт ещё не скачан оператором (см. operator checklist).`);
  }
  const censusDir = path.join(exportRoot, "census");
  await fs.mkdir(censusDir, { recursive: true });
  return { rawDir, censusDir };
}

function fileKind(ext) {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (SQL_EXTS.has(ext)) return "sql";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  if (HTML_EXTS.has(ext)) return "html";
  if (DOC_EXTS.has(ext)) return "doc";
  return "other";
}

/** Рекурсивный обход; symlinks не разрешаются, а отдаются как skip-записи. */
async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      yield { path: full, skipped: true, skipReason: "symlink" };
    } else if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield { path: full, skipped: false, skipReason: "" };
    }
  }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

async function main() {
  const { rawDir, censusDir } = await resolveExportPaths(process.argv.slice(2));
  const header = [
    "legacy_site", "relative_path", "absolute_path", "filename", "extension",
    "size_bytes", "mtime_iso", "sha256", "file_kind", "skipped", "skip_reason",
  ];
  const rows = [header];
  const summary = { total: 0, skipped: 0, byKind: {}, bySite: {} };

  for await (const entry of walk(rawDir)) {
    const rel = path.relative(rawDir, entry.path);
    const ext = path.extname(entry.path).toLowerCase();
    const site = rel.split(path.sep)[0] ?? "unknown";
    const kind = fileKind(ext);
    let size = "";
    let mtime = "";
    let hash = "";
    if (!entry.skipped) {
      try {
        const st = await fs.stat(entry.path);
        size = st.size;
        mtime = st.mtime.toISOString();
        hash = await sha256(entry.path);
      } catch (err) {
        entry.skipped = true;
        entry.skipReason = `unreadable: ${err?.code ?? "unknown"}`;
      }
    }
    rows.push([
      site, rel, entry.path, path.basename(entry.path), ext,
      size, mtime, hash, kind, entry.skipped, entry.skipReason,
    ]);
    summary.total += 1;
    if (entry.skipped) summary.skipped += 1;
    summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1;
    summary.bySite[site] = (summary.bySite[site] ?? 0) + 1;
  }

  const outFile = path.join(censusDir, "files-inventory.csv");
  await fs.writeFile(outFile, rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n", "utf8");

  console.log(`[scan-files] OK → ${outFile}`);
  console.log(`  файлов: ${summary.total}, skipped: ${summary.skipped}`);
  console.log(`  по сайтам: ${JSON.stringify(summary.bySite)}`);
  console.log(`  по типам:  ${JSON.stringify(summary.byKind)}`);
}

main().catch((err) => fail(err?.message ?? String(err)));
