import Link from "next/link"
import type { ReactNode } from "react"

export function PageHeader({ kicker, title, lead, right }: { kicker?: string; title: string; lead?: string; right?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {kicker ? <p className="page-kicker">{kicker}</p> : null}
        <h1 className="page-title">{title}</h1>
        {lead ? <p className="page-lead">{lead}</p> : null}
      </div>
      {right}
    </header>
  )
}

/**
 * Object header answers: what is it, what now, is there a problem, what next.
 * One primary action; secondary actions are text buttons.
 */
export function ObjectHeader({
  back,
  backHref,
  title,
  meta,
  states,
  next,
  primary,
  secondary,
}: {
  back: string
  backHref: string
  title: ReactNode
  meta?: ReactNode
  states?: ReactNode
  next?: ReactNode
  primary?: ReactNode
  secondary?: ReactNode
}) {
  return (
    <header className="object-header">
      <Link className="back-link" href={backHref}>← {back}</Link>
      <div className="object-header-row">
        <div className="object-header-text">
          <h1 className="object-title">{title}</h1>
          {meta ? <p className="meta">{meta}</p> : null}
          {states ? <div className="object-states">{states}</div> : null}
          {next ? (
            <p className="object-next">
              Следующее действие: <strong>{next}</strong>
            </p>
          ) : null}
        </div>
        {primary || secondary ? (
          <div className="object-actions">
            {primary}
            {secondary ? <div className="object-secondary">{secondary}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export function ModeTabs({ items, active }: { items: ReadonlyArray<{ id: string; label: string; href: string }>; active: string }) {
  return (
    <nav className="mode-tabs" aria-label="Режим">
      {items.map((item) => (
        <Link key={item.id} href={item.href} aria-current={item.id === active ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function Card({
  title,
  trailing,
  id,
  tinted,
  accent,
  children,
}: {
  title?: ReactNode
  trailing?: ReactNode
  id?: string
  tinted?: boolean
  accent?: boolean
  children: ReactNode
}) {
  return (
    <section className={`card${tinted ? " tinted" : ""}${accent ? " accent" : ""}`} id={id}>
      {title ? (
        <div className="card-head">
          <h2 className="section-title">{title}</h2>
          {trailing}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <p className="error" role="alert">
      {message}. Обновите страницу или войдите снова
    </p>
  )
}

export function EmptyState({ title, hint, href, linkLabel }: { title: string; hint?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="empty">
      <p className="section-title">{title}</p>
      {hint ? <p className="meta">{hint}</p> : null}
      {href && linkLabel ? <Link href={href}>{linkLabel} ›</Link> : null}
    </div>
  )
}

/** Kept for older call sites. */
export function EmptyBlock({ children }: { children: string }) {
  return <EmptyState title={children} />
}

export function Skeleton({ rows = 4, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {title ? <div className="skeleton title" /> : null}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton row" />
      ))}
    </div>
  )
}
