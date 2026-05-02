# Workbook local source contract (retail pricelist)

## Source of truth

The **retail workbook / pricelist** (розничный прайс) is the operator source-of-truth for retail price and related columns used in workbook-driven governance and parser workflows. It is **not** canonical committed product data in this repository.

## Paths

| Role | Path |
|------|------|
| **Stable local path inside the workspace** (for Cursor and local parser scripts) | `data/raw/workbook/source/retail-price-current.xlsx` |
| **Original file on this machine** (example / initial import) | `~/Downloads/Розничный прайс 18.03.2026.xlsx` |

## Git policy

- `.xlsx` / `.xlsm` / `.xls` under `data/raw/workbook/source/` are **intentionally ignored by git** and must **not** be committed.
- The directory is represented in git via `data/raw/workbook/source/.gitkeep` only.
- Repository `.gitignore` uses `/data/raw/*` (not `/data/raw/`) plus a **negated** `!/data/raw/workbook/` line so Git can apply further rules inside `workbook/`; sibling trees under `data/raw/` (for example `legacy/`, `assets/`) stay ignored. Workbook JSON at the `workbook/` root stays ignored; under `source/`, only non-Excel files (today: `.gitkeep`) are candidates for version control.

## Why Cursor can read it

The workbook copy lives **inside the project workspace**. Cursor indexes the workspace; ignored files remain on disk and are readable by the IDE/agent in the local checkout. They are simply excluded from version control.

## Parsed artifacts

Parsed JSON and related outputs stay under the existing **`data/raw/workbook/`** flow (for example parse summaries and sheet JSON next to that tree), not under `source/`. The `source/` folder is only for the **local-only** binary workbook.

## Forbidden without a separate controlled task

- Committing Excel (or other ignored workbook binaries) to git.
- Mutating the workbook as part of unrelated tasks.
- Changing product data, seed, catalog-scope, backend/storefront runtime, ingestion pipelines, or business logic.

Copying or refreshing `retail-price-current.xlsx` locally is an **operator / workspace** action, not a change to canonical product data.
