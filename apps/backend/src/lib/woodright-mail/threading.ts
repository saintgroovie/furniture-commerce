export type ThreadHeaders = {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
}

/** Reply headers join a thread. A shared subject never does. */
export function threadParentId(headers: ThreadHeaders, knownMessageIds: Set<string>): string | null {
  const candidates = [headers.inReplyTo, ...headers.references].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    if (knownMessageIds.has(candidate)) return candidate
  }
  return null
}
