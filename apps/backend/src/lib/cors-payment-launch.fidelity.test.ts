/**
 * Backend CORS + payment launch mode fidelity.
 *   yarn exec tsx src/lib/cors-payment-launch.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  originIsAllowed,
  parseCorsAllowlist,
  validateAdminCorsPrivate,
  validateProductionAuthCors,
  validateProductionStoreCors,
} from "./cors-origin-policy"
import {
  MANAGER_PAYMENT_LAUNCH_COPY,
  resolvePaymentLaunchMode,
  validatePaymentLaunchMode,
} from "./payment-launch-mode"

const parsed = parseCorsAllowlist(
  "https://woodright.ru, https://www.woodright.ru, https://woodright.ru"
)
assert.deepEqual(parsed.origins, [
  "https://woodright.ru",
  "https://www.woodright.ru",
])
assert.equal(parsed.issues.length, 0)

assert.ok(parseCorsAllowlist("https://woodright.ru, *").issues.some((i) => i.code === "wildcard"))
assert.ok(parseCorsAllowlist("null").issues.length >= 1)

assert.equal(
  originIsAllowed("https://woodright.ru", ["https://woodright.ru"]),
  true
)
assert.equal(
  originIsAllowed("https://woodright.ru.evil.com", ["https://woodright.ru"]),
  false
)
assert.equal(
  originIsAllowed("https://api.woodright.ru", ["https://woodright.ru"]),
  false
)

assert.equal(validateProductionStoreCors("https://woodright.ru").length, 0)
assert.equal(
  validateProductionStoreCors(
    "https://woodright.ru,https://www.woodright.ru"
  ).length,
  0
)
assert.ok(
  validateProductionStoreCors(
    "https://woodright.ru,https://evil.example"
  ).some((i) => i.code === "unapproved_store_origin")
)
assert.ok(
  validateProductionStoreCors("https://woodright-demo.ru").some(
    (i) => i.code === "demo_in_production" || i.code === "missing_apex" || i.code === "unapproved_store_origin"
  )
)
assert.ok(
  validateProductionStoreCors("http://example.com").some(
    (i) => i.code === "http_non_local" || i.code === "unapproved_store_origin" || i.code === "missing_apex"
  )
)

assert.ok(
  validateAdminCorsPrivate("https://woodright.ru").some(
    (i) => i.code === "admin_on_buyer_host" || i.code === "unapproved_admin_origin"
  )
)
assert.ok(
  validateAdminCorsPrivate("https://admin.woodright.ru").some(
    (i) => i.code === "admin_public_host" || i.code === "unapproved_admin_origin"
  )
)
assert.ok(
  validateAdminCorsPrivate("https://evil.example").some(
    (i) => i.code === "unapproved_admin_origin"
  )
)
assert.equal(validateAdminCorsPrivate("https://127.0.0.1:9200").length, 0)

assert.equal(
  validateProductionAuthCors(
    "https://woodright.ru,https://127.0.0.1:9200"
  ).length,
  0
)
assert.ok(
  validateProductionAuthCors(
    "https://woodright.ru,https://evil.example"
  ).some((i) => i.code === "unapproved_auth_origin")
)

assert.equal(resolvePaymentLaunchMode(undefined), "manager_payment_link")
assert.equal(resolvePaymentLaunchMode("online_psp"), "online_psp")
assert.equal(resolvePaymentLaunchMode("not-a-mode"), "invalid")
assert.ok(
  validatePaymentLaunchMode("invalid", {}).some(
    (i) => i.code === "payment_mode_invalid" && i.blocking
  )
)
assert.ok(
  validatePaymentLaunchMode("online_psp", {}).some(
    (i) => i.code === "online_psp_missing_credentials" && i.blocking
  )
)
assert.equal(validatePaymentLaunchMode("manager_payment_link", {}).length, 0)
assert.equal(
  originIsAllowed("http://woodright.ru", ["https://woodright.ru"]),
  false
)
assert.equal(
  originIsAllowed("https://shop.woodright.ru", ["https://woodright.ru"]),
  false
)
assert.equal(MANAGER_PAYMENT_LAUNCH_COPY.unpaid, "Ожидает оплаты")
assert.equal(MANAGER_PAYMENT_LAUNCH_COPY.operatorMarkedPaid, "Оплата отмечена менеджером")
assert.equal(MANAGER_PAYMENT_LAUNCH_COPY.captured, "Оплата подтверждена")

// Role/exposure matrix notes (medusa-config gates; documented here for fidelity):
// - public + public_demo → demo origins allowed (no production allowlist)
// - public + production|production_candidate|empty|unknown → production allowlist
assert.ok(
  validateProductionStoreCors("https://woodright-demo.ru").some(
    (i) => i.code === "demo_in_production" || i.code === "unapproved_store_origin" || i.code === "missing_apex"
  )
)

console.log("cors-payment-launch.fidelity: ok")
