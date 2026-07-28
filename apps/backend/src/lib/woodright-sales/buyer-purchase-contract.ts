import {
  SALES_MODE_CTA,
  SALES_MODE_OWNER_LABEL,
  projectSalesModeFromClassification,
  type ProductClassificationType,
  type SalesMode,
  type SalesModifier,
} from "./sales-modes"

export type PurchaseFlow = "cart" | "quote" | "bespoke" | "none"

export type BuyerPurchaseContract = {
  sales_mode: SalesMode
  modifiers: SalesModifier[]
  can_purchase: boolean
  purchase_flow: PurchaseFlow
  cta_label: string
  availability_label: string
  requires_configuration: boolean
  requires_manager: boolean
  stock_relevant: boolean
  reason_code: string | null
  lead_time_text: string | null
  buyer_message: string | null
}

export type BuyerPurchaseInput = {
  sales_mode?: SalesMode | null
  modifiers?: SalesModifier[]
  classification?: ProductClassificationType | null
  launch_mode?: string | null
  manager_confirmation_required?: boolean
  lead_time_text?: string | null
  buyer_message?: string | null
  inventory_quantity?: number | null
  configuration_complete?: boolean
}

function stockOk(mode: SalesMode, qty: number | null | undefined): boolean {
  if (mode === "in_stock" || mode === "showroom_sample") {
    return typeof qty === "number" ? qty > 0 : true
  }
  return true
}

export function buildBuyerPurchaseContract(
  input: BuyerPurchaseInput
): BuyerPurchaseContract {
  const fromClass = projectSalesModeFromClassification(input.classification ?? null)
  const sales_mode: SalesMode = input.sales_mode ?? fromClass ?? "unavailable"
  const modifiers = input.modifiers ?? []
  const launchQuote = input.launch_mode === "request_quote"
  const lead_time_text = input.lead_time_text ?? null
  const buyer_message = input.buyer_message ?? null

  if (launchQuote && sales_mode !== "bespoke_project") {
    return {
      sales_mode: "quote_required",
      modifiers,
      can_purchase: false,
      purchase_flow: "quote",
      cta_label: SALES_MODE_CTA.quote_required,
      availability_label: SALES_MODE_OWNER_LABEL.quote_required,
      requires_configuration: false,
      requires_manager: true,
      stock_relevant: false,
      reason_code: "LAUNCH_MODE_REQUEST_QUOTE",
      lead_time_text,
      buyer_message,
    }
  }

  const requires_manager =
    Boolean(input.manager_confirmation_required) ||
    modifiers.includes("manager_confirmation_required") ||
    sales_mode === "quote_required" ||
    sales_mode === "bespoke_project"

  const requires_configuration = sales_mode === "configurable_to_order"
  const stock_relevant =
    sales_mode === "in_stock" || sales_mode === "showroom_sample"

  if (sales_mode === "unavailable") {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "none",
      cta_label: SALES_MODE_CTA.unavailable,
      availability_label: SALES_MODE_OWNER_LABEL.unavailable,
      requires_configuration: false,
      requires_manager: false,
      stock_relevant: false,
      reason_code: "UNAVAILABLE",
      lead_time_text,
      buyer_message,
    }
  }

  if (sales_mode === "bespoke_project") {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "bespoke",
      cta_label: SALES_MODE_CTA.bespoke_project,
      availability_label: SALES_MODE_OWNER_LABEL.bespoke_project,
      requires_configuration: false,
      requires_manager: true,
      stock_relevant: false,
      reason_code: "BESPOKE_PROJECT",
      lead_time_text,
      buyer_message,
    }
  }

  if (sales_mode === "quote_required") {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "quote",
      cta_label: SALES_MODE_CTA.quote_required,
      availability_label: SALES_MODE_OWNER_LABEL.quote_required,
      requires_configuration: false,
      requires_manager: true,
      stock_relevant: false,
      reason_code: "QUOTE_REQUIRED",
      lead_time_text,
      buyer_message,
    }
  }

  if (modifiers.includes("only_as_set")) {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "none",
      cta_label: "Смотреть комплект",
      availability_label: "Доступен в составе комплекта",
      requires_configuration: false,
      requires_manager,
      stock_relevant: false,
      reason_code: "ONLY_AS_SET",
      lead_time_text,
      buyer_message,
    }
  }

  if (requires_configuration && input.configuration_complete === false) {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "cart",
      cta_label: "Выберите параметры",
      availability_label: SALES_MODE_OWNER_LABEL[sales_mode],
      requires_configuration: true,
      requires_manager,
      stock_relevant,
      reason_code: "CONFIGURATION_REQUIRED",
      lead_time_text,
      buyer_message,
    }
  }

  if (!stockOk(sales_mode, input.inventory_quantity)) {
    return {
      sales_mode,
      modifiers,
      can_purchase: false,
      purchase_flow: "none",
      cta_label: SALES_MODE_CTA.unavailable,
      availability_label: "Сейчас нет в наличии",
      requires_configuration,
      requires_manager,
      stock_relevant: true,
      reason_code: "OUT_OF_STOCK",
      lead_time_text,
      buyer_message,
    }
  }

  return {
    sales_mode,
    modifiers,
    can_purchase: true,
    purchase_flow: "cart",
    cta_label: SALES_MODE_CTA[sales_mode],
    availability_label: SALES_MODE_OWNER_LABEL[sales_mode],
    requires_configuration,
    requires_manager,
    stock_relevant,
    reason_code: null,
    lead_time_text,
    buyer_message,
  }
}
