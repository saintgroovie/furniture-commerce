import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"

export type WwApproveGuard = {
  ok: boolean
  reason: string | null
}

export function isWillieWinkieItem(item: ChecklistItem, ctx?: SkuPoolContext): boolean {
  return Boolean(ctx?.is_willie_winkie || item.collection === "willie-winkie")
}

export function wwApproveGuard(item: ChecklistItem, ctx?: SkuPoolContext): WwApproveGuard {
  if (!isWillieWinkieItem(item, ctx)) return { ok: true, reason: null }

  if (!ctx?.product_type_title?.trim()) {
    return {
      ok: false,
      reason: "Тип товара не определён — для Willie Winkie нужен Needs review.",
    }
  }

  if (ctx.motif_mismatch || ctx.decor_mismatch) {
    return {
      ok: false,
      reason:
        "Разные подколлекции росписи (SKU vs legacy) при той же форме — не approve; Needs review или Reject.",
    }
  }

  if (!ctx.motif_subcollection || ctx.motif_confidence === "unknown") {
    return {
      ok: false,
      reason: "Роспись / мотив не определены — для Willie Winkie только Needs review или проверка по фото.",
    }
  }

  if (ctx.motif_confidence === "low") {
    return {
      ok: false,
      reason: "Роспись / мотив с низкой уверенностью — Approve только после визуальной сверки мотива на фото.",
    }
  }

  return { ok: true, reason: null }
}
