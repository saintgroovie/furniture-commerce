/**
 * Axis mapping note (Woodright furniture dimensions).
 *
 * Confirmed from repo audit 2026-07-25 (Medusa 2.17.2 worktree):
 *
 * | Domain axis | Storage key              | Buyer label |
 * |-------------|--------------------------|-------------|
 * | height      | height_mm                | Высота      |
 * | width       | width_mm                 | Ширина      |
 * | depth       | depth_mm                 | Глубина     |
 *
 * Sources (structured only):
 * - product.metadata.dimensions
 * - product.metadata.dimensions_normalized
 * - variant.metadata.dimensions (preferred when present)
 * - variant.metadata.dimensions_normalized
 *
 * NOT furniture SoT (ignored by resolver):
 * - Medusa ProductVariant.height / .width / .length
 * - No evidence in this codebase that Medusa `length` means Глубина.
 *
 * Buyer display order is always Высота → Ширина → Глубина.
 * Zero / negative / NaN / empty string are unknown, never shown as size.
 */
export {}
