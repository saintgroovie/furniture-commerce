/** Maps network/API failures to short Russian copy for storefront CTAs. */
export function userFacingError(e: unknown, fallback = "Ошибка"): string {
  if (e instanceof TypeError) {
    return "Не удалось связаться с сервером. Проверьте, что backend запущен (порт 9000)."
  }
  if (e instanceof Error) {
    const m = e.message.trim()
    if (m === "Failed to fetch" || /failed to fetch/i.test(m)) {
      return "Не удалось связаться с сервером. Проверьте, что backend запущен (порт 9000)."
    }
    try {
      const data = JSON.parse(m) as { message?: string }
      if (typeof data.message === "string" && data.message.length > 0) {
        return data.message
      }
    } catch {
      /* plain text */
    }
    if (m.length > 240) return fallback
    return m || fallback
  }
  return fallback
}
