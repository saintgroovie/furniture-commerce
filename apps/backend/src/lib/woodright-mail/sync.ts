export type SyncCheckpoint = {
  folder: string
  uidValidity: string
  lastUid: number
}

export function planSync(input: {
  checkpoint: SyncCheckpoint | null
  folder: string
  uidValidity: string
}): { mode: "incremental" | "resync"; fromUid: number } {
  if (!input.checkpoint || input.checkpoint.folder !== input.folder || input.checkpoint.uidValidity !== input.uidValidity) {
    return { mode: "resync", fromUid: 0 }
  }
  return { mode: "incremental", fromUid: input.checkpoint.lastUid }
}

/** Bounded backoff after a dropped connection. Attempt 1 waits 1s, then doubles, capped at 5 minutes. */
export function nextRetryDelayMs(attempt: number): number {
  const step = Math.max(1, Math.floor(attempt))
  return Math.min(300_000, 1000 * 2 ** Math.min(step - 1, 9))
}
