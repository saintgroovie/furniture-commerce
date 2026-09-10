/**
 * Session cookie Secure flag for Medusa HTTP config.
 *
 * `medusa start` sets NODE_ENV=production. Local LaunchAgent QA still serves
 * HTTP loopback, so Secure cookies are never stored and Admin login loops.
 * Traefik HTTPS staging/demo must keep Secure even if MEDUSA_LOCAL_HTTP leaked.
 *
 * Fail-closed: public exposure / public_demo / public_production never get the
 * HTTP cookie exception, even if WOODRIGHT_BACKEND_MODE=qa leaked into the image.
 */
export function isLocalQaHttp(opts: {
  localHttp: boolean
  backendMode: string | undefined
  exposure?: string | undefined
  runtimeRole?: string | undefined
}): boolean {
  const mode = String(opts.backendMode ?? "")
    .trim()
    .toLowerCase()
  if (!opts.localHttp) return false
  if (mode !== "qa" && mode !== "develop") return false
  const exposure = String(opts.exposure ?? "")
    .trim()
    .toLowerCase()
  if (exposure === "public") return false
  const role = String(opts.runtimeRole ?? "")
    .trim()
    .toLowerCase()
  if (role === "public_demo" || role === "public_production") return false
  return true
}

/** true → Set-Cookie Secure; false → HTTP localhost can persist connect.sid */
export function cookieSecureForRuntime(opts: {
  isProduction: boolean
  localHttp: boolean
  backendMode: string | undefined
  exposure?: string | undefined
  runtimeRole?: string | undefined
}): boolean {
  return opts.isProduction && !isLocalQaHttp(opts)
}
