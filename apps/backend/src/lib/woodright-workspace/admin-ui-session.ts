import { createRequire } from "node:module"
import type { Redis } from "ioredis"

const nodeRequire = createRequire(__filename)
const cookie = nodeRequire("cookie") as { parse: (value: string) => Record<string, string> }
const signature = nodeRequire("cookie-signature") as { unsign: (value: string, secret: string) => string | false }
const jwt = nodeRequire("jsonwebtoken") as { verify: (token: string, secret: string) => { actor_id?: string } }

let redis: Redis | null = null
const emails = new Map<string, string>()

function redisClient(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!redis) {
    const IORedis = nodeRequire("ioredis") as new (url: string, options: { maxRetriesPerRequest: number }) => Redis
    redis = new IORedis(url, { maxRetriesPerRequest: 1 })
  }
  return redis
}

export async function readActorEmail(headers: Record<string, string | string[] | undefined>): Promise<string | null> {
  const authorization = one(headers.authorization)
  const cookieHeader = one(headers.cookie)
  const actorId = actorFromBearer(authorization) || (await actorFromSession(cookieHeader))
  if (!actorId) return null
  const cached = emails.get(actorId)
  if (cached) return cached
  const email = await emailForActor(actorId)
  if (email) emails.set(actorId, email)
  return email
}

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function actorFromBearer(authorization: string | null): string | null {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null
  const token = authorization.slice(7).trim()
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return null
  try {
    const payload = jwt.verify(token, secret)
    return typeof payload.actor_id === "string" ? payload.actor_id : null
  } catch {
    return null
  }
}

async function actorFromSession(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null
  const secret = process.env.COOKIE_SECRET
  const client = redisClient()
  if (!secret || !client) return null
  const raw = cookie.parse(cookieHeader)["connect.sid"]
  if (!raw?.startsWith("s:")) return null
  const sid = signature.unsign(raw.slice(2), secret)
  if (!sid) return null
  const stored = await client.get(`sess:${sid}`)
  if (!stored) return null
  try {
    const session = JSON.parse(stored) as { auth_context?: { actor_id?: string } }
    return session.auth_context?.actor_id ?? null
  } catch {
    return null
  }
}

async function emailForActor(actorId: string): Promise<string | null> {
  const url = process.env.DATABASE_URL
  if (!url) return null
  const { Client } = nodeRequire("pg") as { Client: new (url: string) => {
    connect: () => Promise<void>
    query: (sql: string, params: string[]) => Promise<{ rows: Array<{ email?: string }> }>
    end: () => Promise<void>
  } }
  const client = new Client(url)
  await client.connect()
  try {
    const result = await client.query(`select email from "user" where id = $1 and deleted_at is null`, [actorId])
    const email = result.rows[0]?.email
    return typeof email === "string" ? email.toLowerCase() : null
  } finally {
    await client.end()
  }
}
