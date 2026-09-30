import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { previewAllowed } from "@/lib/runtime-boundary"

export type DeskSession =
  | { kind: "medusa"; token: string; email: string }
  | { kind: "preview"; email: string }

const COOKIE = "wr_desk"

export function encodeSession(session: DeskSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url")
}

export function decodeSession(raw: string | undefined, env: NodeJS.ProcessEnv = process.env): DeskSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as DeskSession
    if (parsed?.kind === "medusa" && parsed.token && parsed.email) return parsed
    if (parsed?.kind === "preview" && parsed.email && previewAllowed(env)) return parsed
  } catch {
    return null
  }
  return null
}

export async function readSession(): Promise<DeskSession | null> {
  const jar = await cookies()
  return decodeSession(jar.get(COOKIE)?.value)
}

export async function requireSession(): Promise<DeskSession> {
  const session = await readSession()
  if (!session) redirect("/login")
  return session
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.WOODRIGHT_WORKSPACE_RUNTIME !== "local-preview",
    path: "/",
    maxAge: 60 * 60 * 12,
  }
}

export { COOKIE }
