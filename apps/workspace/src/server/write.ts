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
  run: () => Promise<void>,
  keep?: Record<string, string>
) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  try {
    await run()
    return redirectTo(request, `${back}${back.includes("?") ? "&" : "?"}saved=1`)
  } catch (error) {
    const message = error instanceof DeskHttpError ? error.message : "Не удалось сохранить"
    const params = new URLSearchParams({ error: message.slice(0, 180) })
    for (const [key, value] of Object.entries(keep ?? {})) {
      if (value) params.set(key, value.slice(0, 2000))
    }
    return redirectTo(request, `${back}?${params.toString()}`)
  }
}

export { medusaSend }
