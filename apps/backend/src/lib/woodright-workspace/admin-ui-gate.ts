/**
 * Native Medusa Admin UI gate. Admin API calls without a browser Origin stay
 * available for Workspace. Fail-close: an empty allow-list denies every
 * identified session while the gate is on.
 */

export type AdminUiDecision = "allow" | "login" | "deny"
export type AdminApiDecision = "pass" | "deny"

export function adminUiGateEnabled(env: {
  WOODRIGHT_MEDUSA_ADMIN_UI_GATE?: string
  WOODRIGHT_DB_ISOLATION?: string
}): boolean {
  return env.WOODRIGHT_MEDUSA_ADMIN_UI_GATE === "1" || env.WOODRIGHT_DB_ISOLATION === "isolated"
}

export function parseAdminEmails(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function decideAdminUi(input: {
  enabled: boolean
  email: string | null
  allow: Set<string>
}): AdminUiDecision {
  if (!input.enabled) return "allow"
  if (!input.email) return "login"
  if (input.allow.has(input.email.toLowerCase())) return "allow"
  return "deny"
}

export function decideAdminApiBrowser(input: {
  enabled: boolean
  path: string
  origin: string | null
  host: string | null
  email: string | null
  allow: Set<string>
}): AdminApiDecision {
  if (!input.enabled) return "pass"
  const path = input.path.split("?")[0] || ""
  if (!path.startsWith("/admin")) return "pass"
  if (!input.origin || !input.host) return "pass"
  let originHost = ""
  try {
    originHost = new URL(input.origin).host
  } catch {
    return "pass"
  }
  if (originHost !== input.host) return "pass"
  if (!input.email) return "pass"
  if (input.allow.has(input.email.toLowerCase())) return "pass"
  return "deny"
}

export function loginHtml(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Техническая админка</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<main>
<h1>Техническая админка</h1>
<p>Вход только для владельца и разработчика</p>
<form id="gate">
<label>Почта <input name="email" type="email" autocomplete="username" required></label>
<label>Пароль <input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Войти</button>
<p id="msg" role="status"></p>
</form>
</main>
<script>
document.getElementById("gate").addEventListener("submit", async (event) => {
  event.preventDefault()
  const msg = document.getElementById("msg")
  msg.textContent = "Входим…"
  const body = new FormData(event.target)
  const email = String(body.get("email") || "")
  const password = String(body.get("password") || "")
  const auth = await fetch("/auth/user/emailpass", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password })
  })
  if (!auth.ok) {
    msg.textContent = "Не удалось войти"
    return
  }
  const payload = await auth.json()
  const session = await fetch("/auth/session", {
    method: "POST",
    headers: { authorization: "Bearer " + payload.token, accept: "application/json" }
  })
  if (!session.ok) {
    msg.textContent = "Не удалось войти"
    return
  }
  location.assign("/app")
})
</script>
</body>
</html>`
}

export function denyHtml(workspaceUrl: string | null): string {
  const href = workspaceUrl && /^https?:\/\//.test(workspaceUrl) ? workspaceUrl : ""
  const link = href ? `<p><a href="${href}">Вернуться в Стол</a></p>` : ""
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Нет доступа</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<main>
<h1>Нет доступа к технической админке</h1>
<p>Обычная работа идёт в Столе</p>
${link}
</main>
</body>
</html>`
}
