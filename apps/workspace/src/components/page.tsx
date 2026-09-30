export function PageHeader({ kicker, title, lead }: { kicker?: string; title: string; lead?: string }) {
  return (
    <header>
      {kicker ? <p className="page-kicker">{kicker}</p> : null}
      <h1 className="page-title">{title}</h1>
      {lead ? <p className="page-lead">{lead}</p> : null}
    </header>
  )
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <p className="error" role="alert">
      {message}. Обновите страницу или войдите снова
    </p>
  )
}

export function EmptyBlock({ children }: { children: string }) {
  return <p className="empty">{children}</p>
}
