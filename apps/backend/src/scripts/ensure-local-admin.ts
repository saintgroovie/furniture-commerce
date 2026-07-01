import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createUsersWorkflow } from "@medusajs/medusa/core-flows"

const DEFAULT_EMAIL = "admin@woodright.ru"
const DEFAULT_PASSWORD = "admin123"

/**
 * Ensures a local admin user exists with known emailpass credentials.
 *
 *   npm run ensure-local-admin
 *   LOCAL_ADMIN_EMAIL=… LOCAL_ADMIN_PASSWORD=… npm run ensure-local-admin
 */
export default async function ensureLocalAdmin({ container }: ExecArgs) {
  const email = process.env.LOCAL_ADMIN_EMAIL ?? DEFAULT_EMAIL
  const password = process.env.LOCAL_ADMIN_PASSWORD ?? DEFAULT_PASSWORD

  if (!password || password.length < 8) {
    throw new Error(
      "Set LOCAL_ADMIN_PASSWORD (min 8 chars) before running ensure-local-admin."
    )
  }

  const authModule = container.resolve(Modules.AUTH)

  const updateResult = await authModule.updateProvider("emailpass", {
    entity_id: email,
    password,
  })

  if (updateResult.success) {
    console.log(`Local admin ready: ${email} (password updated)`)
    return
  }

  const { result: users } = await createUsersWorkflow(container).run({
    input: { users: [{ email }] },
  })
  const user = users?.[0]
  if (!user?.id) {
    throw new Error(
      `Could not create admin for ${email}: ${updateResult.error ?? "unknown error"}`
    )
  }

  const registerResult = await authModule.register("emailpass", {
    body: { email, password },
  })

  if (registerResult.error || !registerResult.authIdentity?.id) {
    throw new Error(
      `User row created but emailpass registration failed: ${registerResult.error ?? "unknown"}`
    )
  }

  await authModule.updateAuthIdentities({
    id: registerResult.authIdentity.id,
    app_metadata: { user_id: user.id },
  })

  console.log(`Local admin created: ${email}`)
}
