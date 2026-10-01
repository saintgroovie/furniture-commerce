export type MailIdentity = {
  provider: string
  mailbox: string
  folder: string
  uid: string | null
  uidValidity: string | null
  messageId: string | null
}

/**
 * Persistent uniqueness. Message-ID is scoped to a mailbox.
 * Without a Message-ID, folder UID plus UIDVALIDITY is the key.
 */
export function deliveryUniqueKey(input: MailIdentity): string {
  if (input.messageId) return [input.provider, input.mailbox, "rfc", input.messageId].join("\n")
  return [input.provider, input.mailbox, input.folder, input.uidValidity ?? "", "uid", input.uid ?? ""].join("\n")
}

/** Message-ID alone is not enough: the same id in another mailbox is a different copy. */
export function isSameDelivery(a: MailIdentity, b: MailIdentity): boolean {
  if (a.provider !== b.provider || a.mailbox !== b.mailbox) return false
  if (a.messageId && b.messageId && a.messageId === b.messageId) return true
  return Boolean(
    a.folder === b.folder &&
      a.uid &&
      b.uid &&
      a.uid === b.uid &&
      a.uidValidity &&
      b.uidValidity &&
      a.uidValidity === b.uidValidity
  )
}
