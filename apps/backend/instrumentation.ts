import { createRequire } from "node:module"
import {
  adminUiGateEnabled,
  decideAdminApiBrowser,
  decideAdminUi,
  denyHtml,
  loginHtml,
  parseAdminEmails,
} from "./src/lib/woodright-workspace/admin-ui-gate"
import { readActorEmail } from "./src/lib/woodright-workspace/admin-ui-session"

type GateRequest = {
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

type GateResponse = {
  status: (code: number) => GateResponse
  type: (value: string) => GateResponse
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
  json: (body: unknown) => void
}

/**
 * Runs before Express is created. The first app.use installs the browser
 * Admin API check. Mounting /app wraps the native Admin UI.
 * Workspace calls /admin without a browser Origin and is left alone.
 */
export function register(): void {
  const require = createRequire(__filename)
  const express = require("express") as { application: { use: (...args: unknown[]) => unknown } }
  const original = express.application.use
  express.application.use = function patchedUse(this: { __woodrightAdminGate?: boolean }, ...args: unknown[]) {
    if (!this.__woodrightAdminGate) {
      this.__woodrightAdminGate = true
      original.call(this, function woodrightAdminApiBrowserGate(req: GateRequest, res: GateResponse, next: () => void) {
        void enforceAdminApi(req, res, next)
      })
    }
    const path = args[0]
    if (path === "/app" || path === "/app/") {
      const wrapped = args.slice(1).map((handler) => {
        if (typeof handler !== "function") return handler
        return function woodrightAdminUiGate(req: GateRequest, res: GateResponse, next: () => void) {
          void enforceAdminUi(req, res, () => {
            ;(handler as (req: GateRequest, res: GateResponse, next: () => void) => void)(req, res, next)
          })
        }
      })
      return original.call(this, path, ...wrapped)
    }
    return original.apply(this, args)
  }
}

async function actorEmail(req: GateRequest): Promise<string | null> {
  return readActorEmail(req.headers ?? {})
}

async function enforceAdminUi(req: GateRequest, res: GateResponse, next: () => void) {
  try {
    const enabled = adminUiGateEnabled(process.env)
    const email = enabled ? await actorEmail(req) : null
    const decision = decideAdminUi({
      enabled,
      email,
      allow: parseAdminEmails(process.env.WOODRIGHT_MEDUSA_ADMIN_EMAILS),
    })
    if (decision === "allow") {
      next()
      return
    }
    res.status(decision === "login" ? 200 : 403)
    res.type("html")
    res.setHeader("cache-control", "no-store")
    res.send(decision === "login" ? loginHtml() : denyHtml(process.env.WOODRIGHT_WORKSPACE_URL ?? null))
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error"
    console.error("admin-ui-gate", name)
    res.status(403).type("html").send(denyHtml(null))
  }
}

async function enforceAdminApi(req: GateRequest, res: GateResponse, next: () => void) {
  try {
    const enabled = adminUiGateEnabled(process.env)
    if (!enabled) {
      next()
      return
    }
    const path = req.url ?? ""
    if (!path.startsWith("/admin")) {
      next()
      return
    }
    const origin = header(req, "origin")
    const host = header(req, "host")
    if (!origin) {
      next()
      return
    }
    const email = await actorEmail(req)
    const decision = decideAdminApiBrowser({
      enabled,
      path,
      origin,
      host,
      email,
      allow: parseAdminEmails(process.env.WOODRIGHT_MEDUSA_ADMIN_EMAILS),
    })
    if (decision === "deny") {
      res.status(403).json({ message: "Техническая админка закрыта" })
      return
    }
    next()
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error"
    console.error("admin-ui-gate", name)
    if (!header(req, "origin")) {
      next()
      return
    }
    res.status(403).json({ message: "Техническая админка закрыта" })
  }
}

function header(req: GateRequest, name: string): string | null {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
