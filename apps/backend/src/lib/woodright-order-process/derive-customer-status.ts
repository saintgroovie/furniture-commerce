import {
  STAGE_BUYER_DESCRIPTION,
  STAGE_BUYER_LABEL,
  type OrderProcessStage,
} from "./stages"

export type PaymentBuyerView = {
  code: string
  label: string
}

export type DeliveryBuyerView = {
  code: string
  label: string
  tracking?: {
    carrier?: string | null
    tracking_number?: string | null
    tracking_url?: string | null
  } | null
}

export type DerivedCustomerStatus = {
  code: string
  label: string
  description: string
  tone: "neutral" | "info" | "warning" | "success" | "danger"
  progress_step: number
  next_expected_action: string | null
  estimated_date: string | null
  tracking: DeliveryBuyerView["tracking"]
}

/**
 * PaymentLink `paid` is operator overlay → distinct label (never silent PSP paid).
 * Medusa refunded/captured wins over PaymentLink.
 */
export function mapPaymentBuyerLabel(input: {
  medusa_payment_status?: string | null
  payment_link_status?: string | null
}): PaymentBuyerView {
  const medusa = (input.medusa_payment_status ?? "").toLowerCase()
  const link = (input.payment_link_status ?? "").toLowerCase()

  if (medusa === "refunded") {
    return { code: "refunded", label: "Возвращено" }
  }
  if (medusa === "partially_refunded") {
    return { code: "partially_refunded", label: "Оплачено частично" }
  }
  if (medusa === "captured" || medusa === "paid") {
    return { code: "paid", label: "Оплата подтверждена" }
  }
  if (link === "paid") {
    return {
      code: "operator_marked_paid",
      label: "Оплата отмечена менеджером",
    }
  }
  if (link === "sent") {
    return { code: "awaiting_payment_link", label: "Ожидает оплаты" }
  }
  if (medusa === "not_paid" || medusa === "awaiting" || !medusa) {
    return { code: "awaiting_payment", label: "Ожидает оплаты" }
  }
  return { code: "awaiting_payment", label: "Ожидает оплаты" }
}

export function mapDeliveryBuyerLabel(input: {
  medusa_fulfillment_status?: string | null
  tracking?: DeliveryBuyerView["tracking"]
}): DeliveryBuyerView {
  const status = (input.medusa_fulfillment_status ?? "").toLowerCase()
  const tracking = input.tracking ?? null
  if (status === "delivered") {
    return { code: "delivered", label: "Доставлен", tracking }
  }
  if (status === "shipped") {
    return { code: "shipped", label: "Передан в доставку", tracking }
  }
  if (status === "fulfilled" || status === "partially_fulfilled") {
    return { code: "preparing", label: "Готовится к отправке", tracking }
  }
  return {
    code: "not_shipped",
    label: "Ещё не передан в доставку",
    tracking,
  }
}

const PROGRESS: Record<string, number> = {
  new: 1,
  needs_confirmation: 2,
  specification_in_progress: 2,
  awaiting_customer_approval: 2,
  confirmed: 3,
  in_production: 4,
  quality_control: 5,
  ready_for_delivery: 6,
  shipped: 7,
  delivered: 8,
  on_hold: 0,
  canceled: 0,
}

export function deriveCustomerOrderStatus(input: {
  stage: OrderProcessStage
  payment: PaymentBuyerView
  delivery: DeliveryBuyerView
  canceled?: boolean
  estimated_date?: string | null
}): DerivedCustomerStatus {
  const estimated_date = input.estimated_date ?? null
  const tracking = input.delivery.tracking ?? null

  if (input.canceled || input.stage === "canceled") {
    return {
      code: "canceled",
      label: STAGE_BUYER_LABEL.canceled,
      description: STAGE_BUYER_DESCRIPTION.canceled,
      tone: "danger",
      progress_step: 0,
      next_expected_action: null,
      estimated_date,
      tracking,
    }
  }
  if (input.stage === "on_hold") {
    return {
      code: "on_hold",
      label: STAGE_BUYER_LABEL.on_hold,
      description: STAGE_BUYER_DESCRIPTION.on_hold,
      tone: "warning",
      progress_step: 0,
      next_expected_action: "Ожидайте сообщение менеджера",
      estimated_date,
      tracking,
    }
  }
  if (input.delivery.code === "delivered") {
    return {
      code: "delivered",
      label: "Доставлен",
      description: "Заказ доставлен",
      tone: "success",
      progress_step: 8,
      next_expected_action: null,
      estimated_date,
      tracking,
    }
  }
  if (input.delivery.code === "shipped") {
    return {
      code: "shipped",
      label: "Передан в доставку",
      description: "Заказ передан в доставку",
      tone: "info",
      progress_step: 7,
      next_expected_action: tracking?.tracking_url
        ? "Отследить доставку"
        : "Ожидайте доставку",
      estimated_date,
      tracking,
    }
  }

  const stage = input.stage
  if (stage === "ready_for_delivery") {
    return {
      code: stage,
      label: STAGE_BUYER_LABEL[stage],
      description: STAGE_BUYER_DESCRIPTION[stage],
      tone: "success",
      progress_step: PROGRESS[stage],
      next_expected_action: "Согласуйте доставку или самовывоз",
      estimated_date,
      tracking,
    }
  }
  if (stage === "quality_control" || stage === "in_production") {
    return {
      code: stage,
      label: STAGE_BUYER_LABEL[stage],
      description: STAGE_BUYER_DESCRIPTION[stage],
      tone: "info",
      progress_step: PROGRESS[stage],
      next_expected_action: null,
      estimated_date,
      tracking,
    }
  }
  if (stage === "awaiting_customer_approval") {
    return {
      code: stage,
      label: STAGE_BUYER_LABEL[stage],
      description: STAGE_BUYER_DESCRIPTION[stage],
      tone: "warning",
      progress_step: PROGRESS[stage],
      next_expected_action: "Подтвердите комплектацию",
      estimated_date,
      tracking,
    }
  }
  if (
    stage === "specification_in_progress" ||
    stage === "needs_confirmation"
  ) {
    return {
      code: stage,
      label: STAGE_BUYER_LABEL[stage],
      description: STAGE_BUYER_DESCRIPTION[stage],
      tone: "info",
      progress_step: PROGRESS[stage],
      next_expected_action: null,
      estimated_date,
      tracking,
    }
  }

  const paymentAwaiting =
    input.payment.code === "awaiting_payment" ||
    input.payment.code === "awaiting_payment_link"
  if (paymentAwaiting && (stage === "new" || stage === "confirmed")) {
    return {
      code: "awaiting_payment",
      label: input.payment.label,
      description: "Ожидаем оплату по заказу",
      tone: "warning",
      progress_step: PROGRESS[stage] ?? 1,
      next_expected_action: "Ожидайте ссылку на оплату от менеджера",
      estimated_date,
      tracking,
    }
  }

  return {
    code: stage,
    label: STAGE_BUYER_LABEL[stage],
    description: STAGE_BUYER_DESCRIPTION[stage],
    tone: "neutral",
    progress_step: PROGRESS[stage] ?? 1,
    next_expected_action: null,
    estimated_date,
    tracking,
  }
}

export type TimelineStepState = "done" | "current" | "upcoming"

export type TimelineStep = {
  key: string
  label: string
  state: TimelineStepState
}

/** Buyer timeline projection (8 steps). */
export function buildBuyerTimeline(input: {
  stage: OrderProcessStage
  delivery: DeliveryBuyerView
  canceled?: boolean
}): TimelineStep[] {
  const steps: { key: string; label: string }[] = [
    { key: "received", label: "Заказ получен" },
    { key: "alignment", label: "Согласование" },
    { key: "confirmed", label: "Заказ подтверждён" },
    { key: "production", label: "Производство" },
    { key: "qc", label: "Проверка качества" },
    { key: "ready", label: "Готов к передаче" },
    { key: "shipping", label: "Доставка" },
    { key: "delivered", label: "Доставлен" },
  ]

  if (input.canceled || input.stage === "canceled") {
    return steps.map((s, i) => ({
      ...s,
      state: i === 0 ? "done" : ("upcoming" as TimelineStepState),
    }))
  }

  let currentIdx = 0
  const stage = input.stage
  if (input.delivery.code === "delivered") currentIdx = 7
  else if (input.delivery.code === "shipped") currentIdx = 6
  else if (stage === "ready_for_delivery") currentIdx = 5
  else if (stage === "quality_control") currentIdx = 4
  else if (stage === "in_production") currentIdx = 3
  else if (stage === "confirmed") currentIdx = 2
  else if (
    stage === "needs_confirmation" ||
    stage === "specification_in_progress" ||
    stage === "awaiting_customer_approval"
  )
    currentIdx = 1
  else currentIdx = 0

  if (stage === "on_hold") {
    // Keep last meaningful index without advancing delivery.
    currentIdx = Math.max(currentIdx, 1)
  }

  return steps.map((s, i) => ({
    ...s,
    state:
      i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming",
  }))
}
