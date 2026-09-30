import { createHmac, timingSafeEqual } from "node:crypto"

export type DeskSession =
  | { kind: "medusa"; token: string; email: string }
  | { kind: "preview"; email: string }

const SESSION_MS = 60 * 60 * 12 * 1000

function sessionSecret(env: NodeJS.ProcessEnv): string | null {
  const value = env.WOODRIGHT_WORKSPACE_SESSION_SECRET?.trim() ?? ""
  if (value.length < 32) return null
  return value
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url")
}

export function encodeSession(
  session: DeskSession,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const secret = sessionSecret(env)
  if (!secret) return null
  const payload = { ...session, exp: now + SESSION_MS }
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${sign(body, secret)}`
}

export function decodeSession(
  raw: string | undefined,
  options: { now?: number; allowPreview?: boolean; env?: NodeJS.ProcessEnv } = {}
): DeskSession | null {
  if (!raw) return null
  const secret = sessionSecret(options.env ?? process.env)
  if (!secret) return null
  const dot = raw.lastIndexOf(".")
  if (dot <= 0) return null
  const body = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  const expected = sign(body, secret)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null
  const now = options.now ?? Date.now()
  const allowPreview = options.allowPreview === true
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DeskSession & { exp?: number }
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null
    if (parsed.kind === "medusa" && parsed.token && parsed.email) {
      return { kind: "medusa", token: parsed.token, email: parsed.email }
    }
    if (parsed.kind === "preview" && parsed.email && allowPreview) {
      return { kind: "preview", email: parsed.email }
    }
  } catch {
    return null
  }
  return null
}
