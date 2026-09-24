/**
 * Yandex Metrika teardown after consent withdrawal.
 * Load/init stays in the client component; this helper is unit-tested.
 */

export const YM_TAG_SRC = "https://mc.yandex.ru/metrika/tag.js"

export function ymCounterObjectKey(counterId: string): string | null {
  const id = Number(counterId)
  if (!Number.isInteger(id) || id <= 0) return null
  return `yaCounter${id}`
}

/** Swallow later queue/hits if tag.js finishes after the visitor turns stats off. */
function disabledYm(): void {}

export function teardownYandexMetrika(
  counterId: string,
  win: object,
  doc?: { querySelectorAll(selector: string): ArrayLike<{ remove(): void }> }
): void {
  const key = ymCounterObjectKey(counterId)
  if (!key) return

  const host = win as Record<string, unknown> & {
    ym?: (...args: unknown[]) => void
  }
  const counter = host[key] as { destruct?: () => void } | undefined
  if (typeof counter?.destruct === "function") {
    counter.destruct()
  }
  delete host[key]
  host.ym = disabledYm

  if (!doc) return
  const scripts = doc.querySelectorAll(`script[src="${YM_TAG_SRC}"]`)
  for (let i = 0; i < scripts.length; i += 1) {
    scripts[i]?.remove()
  }
}
