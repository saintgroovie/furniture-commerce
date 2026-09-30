import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { decodeSession, encodeSession, type DeskSession } from "@/lib/session-codec"
import { previewAllowed } from "@/lib/runtime-boundary"

const COOKIE = "wr_desk"

export async function readSession(): Promise<DeskSession | null> {
  const jar = await cookies()
  return decodeSession(jar.get(COOKIE)?.value, { allowPreview: previewAllowed() })
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
export { encodeSession }
export type { DeskSession }
