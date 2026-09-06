import {
  isSalesMode,
  isSalesModifier,
  type SalesMode,
  type SalesModifier,
} from "./sales-modes"

export type SalesPolicyInput = {
  sales_mode: SalesMode
  modifiers?: SalesModifier[]
  related_room_set_id?: string | null
}

export type SalesPolicyValidation =
  | { ok: true; sales_mode: SalesMode; modifiers: SalesModifier[] }
  | { ok: false; code: string; message: string }

export function validateSalesPolicy(input: {
  sales_mode: unknown
  modifiers?: unknown
  related_room_set_id?: string | null
}): SalesPolicyValidation {
  if (!isSalesMode(input.sales_mode)) {
    return {
      ok: false,
      code: "INVALID_SALES_MODE",
      message: "Некорректный режим продажи",
    }
  }
  const rawMods = Array.isArray(input.modifiers) ? input.modifiers : []
  const modifiers: SalesModifier[] = []
  for (const m of rawMods) {
    if (!isSalesModifier(m)) {
      return {
        ok: false,
        code: "INVALID_SALES_MODIFIER",
        message: "Некорректный дополнительный признак",
      }
    }
    if (!modifiers.includes(m)) modifiers.push(m)
  }

  const mode = input.sales_mode
  if (mode === "unavailable" && modifiers.includes("preorder")) {
    return {
      ok: false,
      code: "MODIFIER_CONFLICT",
      message: "Недоступный товар нельзя помечать как предзаказ",
    }
  }
  if (mode === "in_stock" && modifiers.includes("discontinued")) {
    return {
      ok: false,
      code: "MODIFIER_CONFLICT",
      message: "Товар в наличии нельзя помечать как снятый с производства",
    }
  }
  if (mode === "bespoke_project" && modifiers.includes("preorder")) {
    return {
      ok: false,
      code: "MODIFIER_CONFLICT",
      message: "Индивидуальный проект нельзя помечать как предзаказ",
    }
  }
  if (mode === "showroom_sample" && modifiers.includes("only_as_set")) {
    return {
      ok: false,
      code: "MODIFIER_CONFLICT",
      message: "Выставочный образец нельзя продавать только в комплекте",
    }
  }
  if (modifiers.includes("only_as_set")) {
    const setId = (input.related_room_set_id ?? "").trim()
    if (!setId) {
      return {
        ok: false,
        code: "RELATED_SET_REQUIRED",
        message: "Для признака «только в комплекте» укажите связанный комплект",
      }
    }
  }

  return { ok: true, sales_mode: mode, modifiers }
}
