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
