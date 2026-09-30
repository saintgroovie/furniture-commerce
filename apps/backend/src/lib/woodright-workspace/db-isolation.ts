const DENIED_DATABASES = new Set([
  "medusa-store",
  "medusa",
  "postgres",
  "woodright_smoke",
  "production",
  "demo",
  "public_demo",
])

const DENIED_ROLES = new Set([
  "public_demo",
  "production",
  "production_candidate",
  "public_production",
])

export type IsolationDecision = { ok: true; database: string; port: string } | { ok: false; reason: string }

/**
 * Workspace CRM migrations may run only against an explicitly isolated
 * loopback database. Daily QA (`medusa-store` on 5432), smoke, demo and
 * production URLs are refused before any SQL.
 */
export function decideWorkspaceDbIsolation(env: NodeJS.ProcessEnv): IsolationDecision {
  if (env.WOODRIGHT_DB_ISOLATION !== "isolated") {
    return { ok: false, reason: "WOODRIGHT_DB_ISOLATION must be isolated" }
  }
  const exposure = (env.WOODRIGHT_EXPOSURE ?? "").trim().toLowerCase()
  if (exposure === "public") return { ok: false, reason: "public exposure is refused" }
  const role = (env.WOODRIGHT_RUNTIME_ROLE ?? "").trim().toLowerCase()
  if (DENIED_ROLES.has(role)) return { ok: false, reason: `runtime role ${role} is refused` }
  const raw = env.DATABASE_URL?.trim()
  if (!raw) return { ok: false, reason: "DATABASE_URL is missing" }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a URL" }
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, reason: "DATABASE_URL must be postgres" }
  }
  const host = url.hostname.replace(/\.+$/g, "").toLowerCase()
  if (host !== "127.0.0.1" && host !== "localhost") {
    return { ok: false, reason: "database host must be loopback" }
  }
  const port = url.port || "5432"
  if (port === "5432") return { ok: false, reason: "port 5432 is the daily database" }
  for (const key of ["host", "port", "hostaddr", "dbname"]) {
    if (url.searchParams.has(key)) {
      return { ok: false, reason: `DATABASE_URL must not override ${key}` }
    }
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!database || DENIED_DATABASES.has(database) || !database.startsWith("workspace_it")) {
    return { ok: false, reason: `database ${database || "(empty)"} is not an isolated workspace database` }
  }
  return { ok: true, database, port }
}

export function assertWorkspaceDbIsolation(env: NodeJS.ProcessEnv = process.env): void {
  const decision = decideWorkspaceDbIsolation(env)
  if (!decision.ok) {
    throw new Error(`workspace migration refused: ${decision.reason}`)
  }
}
