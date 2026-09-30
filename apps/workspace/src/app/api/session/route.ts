import { NextResponse } from "next/server"
import { medusaBaseUrl, previewAllowed } from "@/lib/runtime-boundary"
import { redirectTo } from "@/server/redirect"
import { COOKIE, encodeSession, sessionCookieOptions } from "@/server/session"

export async function POST(request: Request) {
  const form = await request.formData()
  const intent = String(form.get("intent") ?? "login")
  if (intent === "logout") {
    const response = redirectTo(request, "/login")
    response.cookies.set(COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
    return response
  }
  if (intent === "preview") {
    if (!previewAllowed()) {
      return NextResponse.json({ message: "Пример выключен" }, { status: 403 })
    }
    const response = redirectTo(request, "/today")
    response.cookies.set(
      COOKIE,
      encodeSession({ kind: "preview", email: "seller@example.com" }),
      sessionCookieOptions()
    )
    return response
  }

  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  const base = medusaBaseUrl()
  if (!base || !email || !password) {
    return redirectTo(request, "/login?error=config")
  }
  const auth = await fetch(new URL("/auth/user/emailpass", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!auth.ok) return redirectTo(request, "/login?error=auth")
  const json = (await auth.json()) as { token?: string }
  if (!json.token) return redirectTo(request, "/login?error=auth")
  const response = redirectTo(request, "/today")
  response.cookies.set(COOKIE, encodeSession({ kind: "medusa", token: json.token, email }), sessionCookieOptions())
  return response
}
