export type NotificationChannel = "email" | "activity"

export type FakeNotificationMessage = {
  event_id: string
  channel: NotificationChannel
  recipient_key: string
  subject: string
  body: string
}

const sentKeys = new Set<string>()
const outbox: FakeNotificationMessage[] = []

function keyOf(m: Pick<FakeNotificationMessage, "event_id" | "channel" | "recipient_key">) {
  return `${m.event_id}::${m.channel}::${m.recipient_key}`
}

/** Test/local provider - never sends real email. */
export function resetFakeNotificationProvider() {
  sentKeys.clear()
  outbox.length = 0
}

export function getFakeNotificationOutbox(): FakeNotificationMessage[] {
  return [...outbox]
}

export function dispatchFakeNotification(
  message: FakeNotificationMessage
): "sent" | "deduped" {
  const k = keyOf(message)
  if (sentKeys.has(k)) return "deduped"
  sentKeys.add(k)
  outbox.push(message)
  return "sent"
}

export function buildStageNotificationCopy(input: {
  stage_label: string
  customer_message?: string | null
}): { subject: string; body: string } {
  const subject = `Woodright: ${input.stage_label}`
  const body = input.customer_message?.trim()
    ? input.customer_message.trim()
    : `Статус заказа: ${input.stage_label}`
  return { subject, body }
}
