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

  if (ctx?.decor_mismatch) {
    return {
      ok: false,
      reason:
        "SKU-префикс и роспись на legacy-странице не совпадают — нельзя approve только по форме.",
    }
  }

  if (!ctx?.decor_motif || ctx.decor_confidence === "unknown") {
    return {
      ok: false,
      reason: "Роспись/декор не определены — для Willie Winkie нужен Needs review или явная проверка фото.",
    }
  }

  if (ctx.decor_confidence === "low" && !item.operator_role) {
    return {
      ok: false,
      reason: "Роспись с низкой уверенностью — назначьте роль и сверьте мотив на фото перед Approve.",
    }
  }

  if (ctx.decor_confidence === "low") {
    return {
      ok: false,
      reason: "Роспись/декор только по эвристике файла — Approve только после визуальной проверки (или Needs review).",
    }
  }

  return { ok: true, reason: null }
}
