import "server-only"
import { medusaBaseUrl } from "@/lib/runtime-boundary"
import { readSession } from "@/server/session"

export class DeskHttpError extends Error {
  status: number
  /** Backend error code (for example `stale_price`) when the JSON body carried one. */
  code: string | null
  /** Whole JSON body of the failed response, for conflict presentation. Never logged to the browser as-is. */
  payload: Record<string, unknown> | null
  constructor(status: number, message: string, code: string | null = null, payload: Record<string, unknown> | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.payload = payload
  }
}

export async function medusaGet<T>(path: string): Promise<T> {
  const session = await readSession()
  if (!session || session.kind !== "medusa") {
    throw new DeskHttpError(401, "Нужен вход")
  }
  const base = medusaBaseUrl()
  if (!base) throw new DeskHttpError(500, "Сервер Medusa не настроен")
  let response: Response
  try {
    response = await fetch(new URL(path, base), {
      headers: { authorization: `Bearer ${session.token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new DeskHttpError(504, "Сервер не ответил. Попробуйте ещё раз")
  }
  if (response.status === 401) throw new DeskHttpError(401, "Сессия закончилась")
  if (!response.ok) {
    throw new DeskHttpError(response.status, "Не удалось загрузить данные")
  }
  return (await response.json()) as T
}

export async function medusaSend<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const session = await readSession()
  if (!session || session.kind !== "medusa") throw new DeskHttpError(401, "Нужен вход")
  const base = medusaBaseUrl()
  if (!base) throw new DeskHttpError(500, "Сервер Medusa не настроен")
  let response: Response
  try {
    response = await fetch(new URL(path, base), {
      method,
      headers: {
        authorization: `Bearer ${session.token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new DeskHttpError(504, "Сервер не подтвердил сохранение. Проверьте список, прежде чем отправлять ещё раз")
  }
  if (!response.ok) {
    let message = humanStatusMessage(response.status)
    let code: string | null = null
    let payload: Record<string, unknown> | null = null
    try {
      const json = (await response.json()) as Record<string, unknown>
      payload = json
      if (typeof json.message === "string" && json.message.trim()) message = json.message
      if (typeof json.code === "string") code = json.code
    } catch {
      payload = null
    }
    throw new DeskHttpError(response.status, message, code, payload)
  }
  return (await response.json()) as T
}

/** Known HTTP statuses → Woodright wording. Unknown errors stay visible, not hidden. */
export function humanStatusMessage(status: number): string {
  if (status === 401) return "Сессия закончилась. Войдите снова"
  if (status === 403) return "У вас нет доступа к этому действию"
  if (status === 404) return "Объект не найден"
  if (status === 409) return "Данные уже изменились. Обновите страницу"
  if (status >= 500) return "Сервер не ответил. Попробуйте ещё раз"
  return "Не удалось сохранить"
}
