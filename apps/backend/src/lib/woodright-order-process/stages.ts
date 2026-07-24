export const ORDER_PROCESS_STAGES = [
  "new",
  "needs_confirmation",
  "specification_in_progress",
  "awaiting_customer_approval",
  "confirmed",
  "in_production",
  "quality_control",
  "ready_for_delivery",
  "on_hold",
  "canceled",
] as const

export type OrderProcessStage = (typeof ORDER_PROCESS_STAGES)[number]

export const STAGE_OWNER_LABEL: Record<OrderProcessStage, string> = {
  new: "Новый заказ",
  needs_confirmation: "Требует подтверждения",
  specification_in_progress: "Согласование комплектации",
  awaiting_customer_approval: "Ожидает согласования клиента",
  confirmed: "Подтверждён",
  in_production: "В производстве",
  quality_control: "Проверка качества",
  ready_for_delivery: "Готов к передаче",
  on_hold: "Приостановлен",
  canceled: "Отменён",
}

export const STAGE_BUYER_LABEL: Record<OrderProcessStage, string> = {
  new: "Заказ получен",
  needs_confirmation: "Уточняем детали заказа",
  specification_in_progress: "Согласовываем материалы и комплектацию",
  awaiting_customer_approval: "Ожидаем вашего подтверждения",
  confirmed: "Заказ подтверждён",
  in_production: "Изготавливаем ваш заказ",
  quality_control: "Проверяем готовое изделие",
  ready_for_delivery: "Заказ готов к доставке или самовывозу",
  on_hold: "Работа по заказу временно приостановлена",
  canceled: "Заказ отменён",
}

export const STAGE_BUYER_DESCRIPTION: Record<OrderProcessStage, string> = {
  new: "Мы получили ваш заказ и скоро начнём работу",
  needs_confirmation: "Менеджер уточняет детали перед подтверждением",
  specification_in_progress: "Согласовываем материалы, размеры и комплектацию",
  awaiting_customer_approval: "Нужно ваше подтверждение комплектации",
  confirmed: "Заказ подтверждён и готовится к производству",
  in_production: "Изделие изготавливается на производстве Woodright",
  quality_control: "Проверяем готовое изделие перед передачей",
  ready_for_delivery: "Можно планировать доставку или самовывоз",
  on_hold: "Работа временно приостановлена - мы сообщим о продолжении",
  canceled: "Заказ отменён",
}

const WORKING: OrderProcessStage[] = [
  "new",
  "needs_confirmation",
  "specification_in_progress",
  "awaiting_customer_approval",
  "confirmed",
  "in_production",
  "quality_control",
  "ready_for_delivery",
]

/** Normal (non-correction) adjacency list. */
const NORMAL_TRANSITIONS: Record<OrderProcessStage, OrderProcessStage[]> = {
  new: ["needs_confirmation", "confirmed", "on_hold"],
  needs_confirmation: [
    "specification_in_progress",
    "confirmed",
    "on_hold",
  ],
  specification_in_progress: [
    "awaiting_customer_approval",
    "confirmed",
    "on_hold",
  ],
  awaiting_customer_approval: [
    "specification_in_progress",
    "confirmed",
    "on_hold",
  ],
  confirmed: ["in_production", "on_hold"],
  in_production: ["quality_control", "on_hold"],
  quality_control: ["in_production", "ready_for_delivery", "on_hold"],
  ready_for_delivery: ["on_hold"],
  on_hold: [], // resume handled specially via previous_stage
  canceled: [],
}

export type TransitionContext = {
  correction?: boolean
  correction_reason?: string | null
  previous_stage?: OrderProcessStage | null
  medusa_order_canceled?: boolean
}

export type TransitionResult =
  | { ok: true; to: OrderProcessStage }
  | { ok: false; code: string; message: string }

export function isOrderProcessStage(value: unknown): value is OrderProcessStage {
  return (
    typeof value === "string" &&
    (ORDER_PROCESS_STAGES as readonly string[]).includes(value)
  )
}

export function listAllowedTransitions(
  from: OrderProcessStage,
  ctx: TransitionContext = {}
): OrderProcessStage[] {
  if (from === "canceled") return []
  if (ctx.medusa_order_canceled) {
    return from === "canceled" ? [] : ["canceled"]
  }
  if (from === "on_hold") {
    const resume = ctx.previous_stage
    if (resume && resume !== "on_hold" && resume !== "canceled") {
      return [resume]
    }
    return WORKING.filter((s) => s !== "new")
  }
  const next = [...NORMAL_TRANSITIONS[from]]
  if (ctx.medusa_order_canceled && !next.includes("canceled")) {
    next.push("canceled")
  }
  return next
}

export function assertStageTransition(
  from: OrderProcessStage,
  to: OrderProcessStage,
  ctx: TransitionContext = {}
): TransitionResult {
  if (from === to) {
    return {
      ok: false,
      code: "SAME_STAGE",
      message: "Этап уже установлен",
    }
  }
  if (to === "canceled") {
    if (!ctx.medusa_order_canceled && !ctx.correction) {
      return {
        ok: false,
        code: "CANCEL_REQUIRES_MEDUSA",
        message:
          "Отмену производственного этапа можно поставить только вместе с отменой заказа Medusa",
      }
    }
    if (ctx.correction) {
      const reason = (ctx.correction_reason ?? "").trim()
      if (reason.length < 10) {
        return {
          ok: false,
          code: "CORRECTION_REASON_REQUIRED",
          message: "Для корректировки укажите причину (не меньше 10 символов)",
        }
      }
    }
    return { ok: true, to }
  }

  if (from === "canceled") {
    return {
      ok: false,
      code: "CANCELED_TERMINAL",
      message: "Отменённый заказ нельзя вернуть в работу в этом MVP",
    }
  }

  if (ctx.correction) {
    const reason = (ctx.correction_reason ?? "").trim()
    if (reason.length < 10) {
      return {
        ok: false,
        code: "CORRECTION_REASON_REQUIRED",
        message: "Для корректировки укажите причину (не меньше 10 символов)",
      }
    }
    if (to === "new") {
      return {
        ok: false,
        code: "INVALID_CORRECTION_TARGET",
        message: "Нельзя вернуть заказ на этап «новый»",
      }
    }
    return { ok: true, to }
  }

  const allowed = listAllowedTransitions(from, ctx)
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: "Такой переход этапа недоступен",
    }
  }
  return { ok: true, to }
}
