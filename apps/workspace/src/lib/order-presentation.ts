import type { StateView } from "./state"

/**
 * Three independent axes of an order. They are projections of backend facts
 * (Medusa payment / fulfillment, Woodright manufacturing stage) and never merge.
 */

export function paymentState(status: string | null | undefined): StateView {
  switch (status) {
    case "captured":
      return { tone: "positive", label: "Оплачен" }
    case "awaiting":
      return { tone: "waiting", label: "Ждём оплату" }
    case "not_paid":
      return { tone: "attention", label: "Не оплачен" }
    case "refunded":
      return { tone: "neutral", label: "Возврат" }
    case "partially_refunded":
      return { tone: "attention", label: "Частичный возврат" }
    case "canceled":
      return { tone: "critical", label: "Оплата отменена" }
    default:
      return { tone: "neutral", label: status ? status : "Оплата неизвестна" }
  }
}

export function fulfillmentState(status: string | null | undefined): StateView {
  switch (status) {
    case "not_fulfilled":
      return { tone: "neutral", label: "Не начата" }
    case "partially_fulfilled":
      return { tone: "waiting", label: "Частично отгружен" }
    case "fulfilled":
      return { tone: "positive", label: "Отгружен" }
    case "shipped":
      return { tone: "waiting", label: "Передан в доставку" }
    case "delivered":
      return { tone: "positive", label: "Доставлен" }
    case "canceled":
      return { tone: "critical", label: "Доставка отменена" }
    default:
      return { tone: "neutral", label: status ? status : "Доставка неизвестна" }
  }
}

const STAGE_LABEL: Record<string, string> = {
  new: "Новый заказ",
  needs_confirmation: "Требует подтверждения",
  specification_in_progress: "Согласование комплектации",
  awaiting_customer_approval: "Ждём клиента",
  confirmed: "Подтверждён",
  in_production: "В производстве",
  quality_control: "Проверка качества",
  ready_for_delivery: "Готов к передаче",
  on_hold: "Приостановлен",
  canceled: "Отменён",
}

export function manufacturingState(stage: string | null | undefined, fallbackLabel?: string | null): StateView {
  if (!stage) return { tone: "neutral", label: "Этап не начат" }
  const label = STAGE_LABEL[stage] ?? fallbackLabel ?? stage
  switch (stage) {
    case "needs_confirmation":
    case "specification_in_progress":
      return { tone: "attention", label }
    case "awaiting_customer_approval":
    case "on_hold":
      return { tone: "waiting", label }
    case "ready_for_delivery":
      return { tone: "positive", label }
    case "canceled":
      return { tone: "critical", label }
    default:
      return { tone: "neutral", label }
  }
}

/** Human next step for the header. Copy only - the allowed transitions still come from the backend. */
export function nextOrderAction(stage: string | null | undefined): string {
  switch (stage) {
    case null:
    case undefined:
    case "new":
      return "подтвердить заказ и начать согласование"
    case "needs_confirmation":
      return "подтвердить заказ"
    case "specification_in_progress":
      return "согласовать комплектацию с клиентом"
    case "awaiting_customer_approval":
      return "дождаться ответа клиента"
    case "confirmed":
      return "запустить производство"
    case "in_production":
      return "дождаться готовности"
    case "quality_control":
      return "проверить качество"
    case "ready_for_delivery":
      return "передать в доставку"
    case "on_hold":
      return "возобновить работу"
    case "canceled":
      return "действий не требуется"
    default:
      return "проверить этап"
  }
}

export type StageOption = { stage: string; label: string }

/**
 * The primary CTA is the first backend-allowed transition. No allowed
 * transition means no primary button - the UI never invents an action.
 */
export function primaryStageAction(allowed: StageOption[] | null | undefined): StageOption | null {
  if (!allowed || allowed.length === 0) return null
  return allowed[0] ?? null
}

export function stageButtonLabel(option: StageOption): string {
  const label = STAGE_LABEL[option.stage] ?? option.label
  return `Перевести в «${label}»`
}

export type OrderAxes = {
  money: StateView
  delivery: StateView
  manufacturing: StateView
}

export function orderAxes(input: {
  payment_status: string | null | undefined
  fulfillment_status: string | null | undefined
  manufacturing_stage: string | null | undefined
  manufacturing_label?: string | null
}): OrderAxes {
  return {
    money: paymentState(input.payment_status),
    delivery: fulfillmentState(input.fulfillment_status),
    manufacturing: manufacturingState(input.manufacturing_stage, input.manufacturing_label),
  }
}

/** Production board columns - a presentation of the same orders, not a second state. */
export const PRODUCTION_COLUMNS: Array<{ id: string; title: string; stages: string[] }> = [
  { id: "new", title: "Новые", stages: ["new", "needs_confirmation"] },
  { id: "spec", title: "Согласование", stages: ["specification_in_progress", "awaiting_customer_approval"] },
  { id: "production", title: "Производство", stages: ["confirmed", "in_production", "quality_control"] },
  { id: "ready", title: "Готовы", stages: ["ready_for_delivery"] },
  { id: "hold", title: "Пауза", stages: ["on_hold"] },
]

export function productionColumnFor(stage: string | null | undefined): string | null {
  if (!stage) return "new"
  const column = PRODUCTION_COLUMNS.find((item) => item.stages.includes(stage))
  return column?.id ?? null
}
