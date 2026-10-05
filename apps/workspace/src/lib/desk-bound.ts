export const DESK_READ_TIMEOUT_MS = 12_000

export const READ_FAILURE = "Не удалось загрузить данные"
export const WRITE_UNCERTAIN = "Не удалось подтвердить запись. Перед повтором проверьте список"

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
}

/**
 * Bound a remote read or write. The timer aborts the signal so a hung
 * upstream settles, and the caller gets a known error instead of an open wait.
 */
/**
 * Fetch plus body, inside the same bound. A stalled body does not outlive
 * the timer, and a dropped connection uses the caller's read or write error.
 */
export async function deskExchange(
  run: (signal: AbortSignal) => Promise<Response>,
  ms: number,
  onFailure: () => Error
): Promise<{ status: number; text: string }> {
  return withDeskBound(async (signal) => {
    try {
      const response = await run(signal)
      const cancelBody = () => {
        void response.body?.cancel().catch(() => undefined)
      }
      signal.addEventListener("abort", cancelBody, { once: true })
      try {
        return { status: response.status, text: await response.text() }
      } finally {
        signal.removeEventListener("abort", cancelBody)
      }
    } catch (error) {
      if (isAbortError(error)) throw error
      throw onFailure()
    }
  }, ms, onFailure)
}

export async function withDeskBound<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  onAbort: () => Error
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const error = new Error("timeout")
      error.name = "TimeoutError"
      reject(error)
    }, ms)
  })
  const job = work(controller.signal).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  )
  const timed = timeout.then(
    () => ({ ok: false as const, error: new Error("timeout") }),
    (error: unknown) => ({ ok: false as const, error })
  )
  try {
    const winner = await Promise.race([job, timed])
    if (!winner.ok) {
      if (isAbortError(winner.error) || controller.signal.aborted) throw onAbort()
      throw winner.error
    }
    return winner.value
  } finally {
    if (timer) clearTimeout(timer)
  }
}
