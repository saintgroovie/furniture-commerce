export function previewAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WOODRIGHT_WORKSPACE_FIXTURES === "1" && env.WOODRIGHT_WORKSPACE_RUNTIME === "local-preview"
}

export function medusaBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.MEDUSA_BACKEND_INTERNAL_URL || env.MEDUSA_BACKEND_URL || ""
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}
