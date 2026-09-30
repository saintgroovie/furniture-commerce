import "server-only"
import { medusaBaseUrl } from "@/lib/runtime-boundary"
import { readSession } from "@/server/session"

export class DeskHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function medusaGet<T>(path: string): Promise<T> {
  const session = await readSession()
  if (!session || session.kind !== "medusa") {
    throw new DeskHttpError(401, "Нужен вход")
  }
  const base = medusaBaseUrl()
  if (!base) throw new DeskHttpError(500, "Сервер Medusa не настроен")
  const response = await fetch(new URL(path, base), {
    headers: { authorization: `Bearer ${session.token}`, accept: "application/json" },
    cache: "no-store",
  })
  if (response.status === 401) throw new DeskHttpError(401, "Сессия закончилась")
  if (!response.ok) {
    throw new DeskHttpError(response.status, "Не удалось загрузить данные")
  }
  return (await response.json()) as T
}

export async function medusaSend<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const session = await readSession()
  if (!session || session.kind !== "medusa") throw new DeskHttpError(401, "Нужен вход")
  const base = medusaBaseUrl()
  if (!base) throw new DeskHttpError(500, "Сервер Medusa не настроен")
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      authorization: `Bearer ${session.token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!response.ok) {
    let message = "Не удалось сохранить"
    try {
      const payload = (await response.json()) as { message?: unknown }
      if (typeof payload.message === "string" && payload.message.trim()) message = payload.message
    } catch {
      message = "Не удалось сохранить"
    }
    throw new DeskHttpError(response.status, message)
  }
  return (await response.json()) as T
}
