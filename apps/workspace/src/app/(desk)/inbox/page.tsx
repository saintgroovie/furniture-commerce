import { redirect } from "next/navigation"
import { Card, PageHeader } from "@/components/page"
import { loadMailStatus } from "@/server/loaders"

/**
 * Hidden until the backend reports a configured, permitted mailbox.
 * Not linked from navigation. A server or frontend env flag cannot open it.
 */
export default async function InboxPage() {
  const status = await loadMailStatus()
  if (!status.ok || !status.data.visible) redirect("/today")
  return (
    <>
      <PageHeader kicker="Почта" title="Входящие" lead="Пока только проверка на тестовых данных. Письма клиента здесь не отправляются" />
      <Card title="Нет подключённого ящика">
        <p className="meta">Ответ клиенту и внутренняя заметка - разные действия. Живая почта выключена</p>
      </Card>
    </>
  )
}
