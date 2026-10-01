import "server-only"
import { DeskHttpError, medusaSend } from "@/server/medusa"
import { redirectTo } from "@/server/redirect"
import { readSession } from "@/server/session"

export async function requireDeskSession(request: Request) {
  const session = await readSession()
  if (!session || session.kind !== "medusa") {
    return { ok: false as const, response: redirectTo(request, "/login") }
  }
  return { ok: true as const }
}

export async function writeAndReturn(
  request: Request,
  back: string,
  run: () => Promise<void | { storefront?: "match" | "miss" | "skipped" }>,
  keep?: Record<string, string>
) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  try {
    const extra = await run()
    const params = new URLSearchParams({ saved: "1" })
    if (extra && typeof extra === "object" && extra.storefront) {
      params.set("storefront", extra.storefront)
    }
    const [path, hash] = back.split("#")
    return redirectTo(request, `${path}${path.includes("?") ? "&" : "?"}${params.toString()}${hash ? `#${hash}` : ""}`)
  } catch (error) {
    const message = error instanceof DeskHttpError ? error.message : "Не удалось сохранить"
    const params = new URLSearchParams({ error: message.slice(0, 180) })
    for (const [key, value] of Object.entries(keep ?? {})) {
      if (value) params.set(key, value.slice(0, 2000))
    }
    if (error instanceof DeskHttpError && error.code === "stale_price") {
      // Conflict stays visible: server amount + employee amount, no silent overwrite.
      params.set("conflict", "price")
      const current = error.payload?.current_amount
      if (typeof current === "number") params.set("server_amount", String(current))
    }
    if (error instanceof DeskHttpError && error.code === "needs_confirm") {
      params.set("confirm", "needed")
    }
    if (!(error instanceof DeskHttpError)) {
      console.error("[desk write] unexpected error", { back, name: (error as Error)?.name })
    }
    const [path, hash] = back.split("#")
    return redirectTo(request, `${path}${path.includes("?") ? "&" : "?"}${params.toString()}${hash ? `#${hash}` : ""}`)
  }
}

export { medusaSend }
