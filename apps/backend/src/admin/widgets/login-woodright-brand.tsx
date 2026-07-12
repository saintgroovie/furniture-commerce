import { Text } from "@medusajs/ui"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

/**
 * Soft brand mark on the stock login screen (injection zone only — no dashboard fork).
 */
const LoginWoodrightBrand = () => {
  return (
    <div className="mb-4 text-center">
      <Text size="small" className="text-ui-fg-subtle">
        Админка оператора Woodright
      </Text>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "login.before",
  id: "woodright-login-brand",
})

export default LoginWoodrightBrand
