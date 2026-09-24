/**
 * Storefront analytics + webmaster verification.
 *
 * Fail-closed: empty/malformed IDs mean no third-party scripts and no
 * verification meta. Counter ID is passed from a Server Component so
 * production can set `YANDEX_METRIKA_ID` at runtime without baking
 * `NEXT_PUBLIC_*` into the image.
 *
 * Do not log raw tokens.
 */

export const YM_CONSENT_COOKIE = "wr_ym_consent"
export const YM_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export const YANDEX_METRIKA_CSP_ORIGINS = [
  "https://mc.yandex.ru",
  "https://mc.yandex.com",
] as const

export type YmConsent = "1" | "0"

export type AnalyticsPublicConfig = {
  yandexMetrikaId: string | null
  googleSiteVerification: string | null
  yandexWebmasterVerification: string | null
}

function parseMetrikaId(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!/^\d{4,12}$/.test(value)) return null
  return value
}

function parseVerificationToken(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) return null
  return value
}

export function parseYmConsent(
  raw: string | undefined | null
): YmConsent | null {
  if (raw === "1" || raw === "0") return raw
  return null
}

export function loadAnalyticsPublicConfig(
  env: NodeJS.ProcessEnv = process.env
): AnalyticsPublicConfig {
  return {
    yandexMetrikaId: parseMetrikaId(env.YANDEX_METRIKA_ID),
    googleSiteVerification: parseVerificationToken(
      env.GOOGLE_SITE_VERIFICATION
    ),
    yandexWebmasterVerification: parseVerificationToken(
      env.YANDEX_WEBMASTER_VERIFICATION ?? env.YANDEX_VERIFICATION
    ),
  }
}

export function isYandexMetrikaConfigured(
  analytics: AnalyticsPublicConfig = loadAnalyticsPublicConfig()
): boolean {
  return Boolean(analytics.yandexMetrikaId)
}

export function analyticsCspConnectExtras(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!loadAnalyticsPublicConfig(env).yandexMetrikaId) return []
  return [...YANDEX_METRIKA_CSP_ORIGINS]
}

export function buildImgSrcDirective(
  env: NodeJS.ProcessEnv = process.env
): string {
  const parts = ["'self'", "data:", "blob:", ...analyticsCspConnectExtras(env)]
  return `img-src ${parts.join(" ")}`
}

export function webmasterVerificationMetadata(
  analytics: AnalyticsPublicConfig = loadAnalyticsPublicConfig()
): { google?: string; yandex?: string } | undefined {
  const verification: { google?: string; yandex?: string } = {}
  if (analytics.googleSiteVerification) {
    verification.google = analytics.googleSiteVerification
  }
  if (analytics.yandexWebmasterVerification) {
    verification.yandex = analytics.yandexWebmasterVerification
  }
  return Object.keys(verification).length ? verification : undefined
}
