/**
 * Browser-safe Oliver false finish-color split guard (no `apps/backend` imports).
 * Keep in sync with apps/backend/src/lib/oliver-finish-execution-guard.ts.
 */
export type ColorExecution = { key: string; label: string; urls: string[] }

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function normalizeUrlKey(url: string): string {
  const s = url.trim()
  const m = s.match(/(\/static\/products\/[^\s?#]+)/i)
  return (m?.[1] ?? s).toLowerCase()
}

export function extractOliverColorTokenFromUrl(url: string): string | null {
  const hay = basenameKey(url)
  const explicit = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/i)
  if (explicit?.[1]) {
    const t = explicit[1].toLowerCase()
    return t === "lillian" ? "lilian" : t
  }
  return null
}

export type OliverGalleryColorHeroPair = {
  gallery01: string
  colorHero: string
  colorToken: string
}

export function detectOliverGalleryColorHeroPair(
  urls: string[]
): OliverGalleryColorHeroPair | null {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
  if (unique.length !== 2) return null

  const gallery01 = unique.find((u) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(basenameKey(u)))
  const colorHero = unique.find((u) =>
    /color[_-][a-z0-9-]+[_-]0?1(?:\.|[-_]|$)/i.test(basenameKey(u))
  )
  if (!gallery01 || !colorHero) return null

  const colorToken = extractOliverColorTokenFromUrl(colorHero)
  if (!colorToken) return null
  if (extractOliverColorTokenFromUrl(gallery01)) return null

  return { gallery01, colorHero, colorToken }
}

export function isOliverFalseFinishColorSplit(
  urls: string[],
  executions: ColorExecution[] | null | undefined,
  handle?: string
): boolean {
  if (!handle?.toLowerCase().startsWith("ol-")) return false
  if (!executions || executions.length < 2) return false
  return detectOliverGalleryColorHeroPair(urls) != null
}

export function repairOliverFalseFinishColorExecutions(
  executions: ColorExecution[] | null | undefined,
  urls: string[],
  handle?: string
): { executions: ColorExecution[] | null; changed: boolean; pair: OliverGalleryColorHeroPair | null } {
  const pair = detectOliverGalleryColorHeroPair(urls)
  if (!pair || !handle?.toLowerCase().startsWith("ol-")) {
    return { executions: executions ?? null, changed: false, pair: null }
  }
  if (!executions || executions.length < 2) {
    return { executions: executions ?? null, changed: false, pair }
  }

  const label =
    executions.find((e) => e.key === pair.colorToken)?.label?.trim() ||
    executions.find((e) =>
      e.urls?.some((u) => normalizeUrlKey(u) === normalizeUrlKey(pair.colorHero))
    )?.label?.trim() ||
    pair.colorToken

  const merged: ColorExecution = {
    key: pair.colorToken,
    label,
    urls: [pair.colorHero, pair.gallery01],
  }

  return { executions: [merged], changed: true, pair }
}

export function shouldSuppressOliverFinishWhenFabricCanonical(
  handle: string | undefined,
  meta: Record<string, unknown> | undefined
): boolean {
  if (!handle?.toLowerCase().startsWith("ol-") || !meta) return false
  const fabricRaw = meta.fabric_upholstery_executions ?? meta.upholstery_color_executions
  const finishRaw = meta.finish_color_executions ?? meta.paint_finish_executions
  const fabric = Array.isArray(fabricRaw) && fabricRaw.length > 0 ? fabricRaw : null
  const finish = Array.isArray(finishRaw) && finishRaw.length > 0 ? finishRaw : null
  return Boolean(fabric && fabric.length >= 2 && finish && finish.length >= 2)
}
