/**
 * Explicit payment launch mode for Woodright.
 *
 * Target launch: manager_payment_link (no online PSP activation).
 * Buyer payment labels remain in derive-customer-status / mapPaymentBuyerLabel.
 */

export type PaymentLaunchMode =
  | "manager_payment_link"
  | "request_only"
  | "online_psp"

export type PaymentModeIssue = { code: string; message: string; blocking: boolean }

export function resolvePaymentLaunchMode(
  raw: string | undefined | null = process.env.WOODRIGHT_PAYMENT_LAUNCH_MODE
): PaymentLaunchMode | "invalid" {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "" || v === "manager_payment_link") return "manager_payment_link"
  if (v === "request_only") return "request_only"
  if (v === "online_psp") return "online_psp"
  return "invalid"
}

export function hasOnlinePspCredentials(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  // Require a coherent provider set - not a single stray key.
  const stripe =
    String(env.STRIPE_API_KEY ?? env.STRIPE_SECRET_KEY ?? "").trim().length > 0 &&
    String(env.WOODRIGHT_PSP_WEBHOOK_SECRET ?? "").trim().length > 0
  const yookassa =
    String(env.YOOKASSA_SECRET_KEY ?? "").trim().length > 0 &&
    String(env.YOOKASSA_SHOP_ID ?? "").trim().length > 0 &&
    String(env.WOODRIGHT_PSP_WEBHOOK_SECRET ?? "").trim().length > 0
  return stripe || yookassa
}

export function validatePaymentLaunchMode(
  mode: PaymentLaunchMode | "invalid" = resolvePaymentLaunchMode(),
  env: NodeJS.ProcessEnv = process.env
): PaymentModeIssue[] {
  const issues: PaymentModeIssue[] = []
  if (mode === "invalid") {
    issues.push({
      code: "payment_mode_invalid",
      message: "WOODRIGHT_PAYMENT_LAUNCH_MODE must be manager_payment_link|request_only|online_psp",
      blocking: true,
    })
    return issues
  }
  if (mode === "online_psp" && !hasOnlinePspCredentials(env)) {
    issues.push({
      code: "online_psp_missing_credentials",
      message: "online_psp requires complete PSP credentials and webhook secret",
      blocking: true,
    })
  }
  return issues
}

/** Buyer-facing honesty lines for storefront (server may expose via copy). */
export const MANAGER_PAYMENT_LAUNCH_COPY = {
  mode: "manager_payment_link" as const,
  unpaid: "Ожидает оплаты",
  operatorMarkedPaid: "Оплата отмечена менеджером",
  captured: "Оплата подтверждена",
  checkoutNote:
    "После оформления менеджер подтвердит состав заказа и пришлёт ссылку на оплату",
} as const
