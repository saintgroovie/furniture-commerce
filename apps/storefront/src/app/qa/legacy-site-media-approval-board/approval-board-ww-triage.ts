import { buildCandidateMotifView } from "./approval-board-operator-motif"
import { isWillieWinkieTaxonomy } from "./approval-board-ww-taxonomy"
import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"

export type WwApproveGuard = {
  ok: boolean
  reason: string | null
  warning: string | null
}

export function isWillieWinkieItem(item: ChecklistItem, ctx?: SkuPoolContext): boolean {
  return isWillieWinkieTaxonomy(item.handle, item.collection, ctx)
}

export function wwApproveGuard(item: ChecklistItem, ctx?: SkuPoolContext): WwApproveGuard {
  if (!isWillieWinkieItem(item, ctx)) return { ok: true, reason: null, warning: null }

  const view = buildCandidateMotifView(ctx, item)

  if (!ctx?.product_type_title?.trim()) {
    return {
      ok: false,
      reason: "Тип товара не определён — для Willie Winkie нужен Needs review.",
      warning: null,
    }
  }

  if (view.legacy_metadata_mismatch && !view.operator_confirmed_motif) {
    return {
      ok: false,
      reason: `SKU ожидает «${view.expected_motif_from_sku_prefix}», legacy — «${view.legacy_page_motif}». Approve только после ручного подтверждения мотива в заметке.`,
      warning: null,
    }
  }

  if (!view.resolved_motif || view.motif_confidence === "unknown") {
    return {
      ok: false,
      reason: "Роспись / мотив не определены — для Willie Winkie только Needs review или проверка по фото.",
      warning: null,
    }
  }

  if (view.motif_confidence === "low") {
    return {
      ok: false,
      reason: "Роспись / мотив с низкой уверенностью — Approve только после визуальной сверки мотива на фото.",
      warning: null,
    }
  }

  if (view.operator_confirmed_metadata_mismatch) {
    return {
      ok: true,
      reason: null,
      warning:
        "Legacy metadata mismatch остаётся (страница ≠ SKU), но оператор подтвердил мотив в заметке — approve допустим после сверки фото.",
    }
  }

  return { ok: true, reason: null, warning: null }
}
