/**
 * Woodright payment-mode contract for public-launch readiness.
 *
 * Only `manual_invoice` exists today: the order completes without an online
 * PSP charge (`pp_system_default` no-op payment session required by Medusa
 * checkout - see `apps/storefront/src/lib/api/checkout.ts`), and a manager
 * sends a payment link to the buyer afterwards
 * (`apps/backend/src/api/admin/payment-links`).
 *
 * `pp_system_default` is checkout plumbing, never a PSP name - this module
 * must not describe it as an online payment provider.
 *
 * Do not add a second mode (e.g. `online_provider`) until a real online PSP
 * integration exists in the codebase - see `woodright-core.mdc`: "Do NOT
 * invent legal facts... PSP names".
 */
import {
  isProductionLikeRuntime,
  type PaymentMode,
} from "@/lib/launch-contract"

export type { PaymentMode }

const SUPPORTED_MODES: readonly PaymentMode[] = ["manual_invoice"]

export type ResolvePaymentModeEnv = {
  nodeEnv?: string | null
  runtimeRole?: string | null
}

function defaultResolvePaymentModeEnv(): ResolvePaymentModeEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    runtimeRole: process.env.WOODRIGHT_RUNTIME_ROLE,
  }
}

/**
 * Resolve `WOODRIGHT_PAYMENT_MODE`. Fail-closed: unknown values always
 * throw; missing values only throw for production-like runtimes (mirrors
 * `resolveLaunchMode` in `@/lib/launch-contract`) - local/dev/tests default
 * to `manual_invoice` (the only mode that exists) without requiring the var.
 */
export function resolvePaymentMode(
  raw: string | undefined | null,
  env: ResolvePaymentModeEnv = defaultResolvePaymentModeEnv()
): PaymentMode {
  const value = String(raw ?? "").trim().toLowerCase()

  if (value) {
    if ((SUPPORTED_MODES as readonly string[]).includes(value)) {
      return value as PaymentMode
    }
    if (value === "pp_system_default" || value === "online_provider") {
      throw new Error(
        `WOODRIGHT_PAYMENT_MODE="${raw}" is not a supported payment mode - "pp_system_default" is checkout plumbing, not a PSP, and no online PSP integration exists yet`
      )
    }
    throw new Error(
      `Unknown WOODRIGHT_PAYMENT_MODE: "${raw}" (expected one of: ${SUPPORTED_MODES.join(", ")})`
    )
  }

  const roleIsProductionLike = isProductionLikeRuntime(env.runtimeRole)
  const nodeEnvIsProduction = String(env.nodeEnv ?? "").trim() === "production"
  if (roleIsProductionLike && nodeEnvIsProduction) {
    throw new Error(
      `WOODRIGHT_PAYMENT_MODE is required when WOODRIGHT_RUNTIME_ROLE="${env.runtimeRole}" and NODE_ENV=production`
    )
  }

  return "manual_invoice"
}

/**
 * No current payment mode is public-ready. `manual_invoice` is acceptable
 * for `private_noindex` (private candidate, owner/QA traffic only) but must
 * not be treated as ready for `public_indexable` until the business owner
 * explicitly confirms the public payment story (PSP, invoicing entity,
 * refund flow). Keep in sync with
 * `@/lib/launch-contract`:`validateLaunchContract`'s inline duplicate check.
 */
export function isPublicPaymentReady(mode: PaymentMode): boolean {
  void mode
  return false
}

export function isSupportedPaymentMode(value: string): value is PaymentMode {
  return (SUPPORTED_MODES as readonly string[]).includes(value)
}

export const SUPPORTED_PAYMENT_MODES: readonly PaymentMode[] = SUPPORTED_MODES
