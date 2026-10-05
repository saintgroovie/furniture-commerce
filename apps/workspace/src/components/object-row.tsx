import Link from "next/link"
import type { ReactNode } from "react"

export function Avatar({ name, size }: { name: string | null | undefined; size?: "sm" }) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join("")
  return (
    <span className={`avatar${size === "sm" ? " sm" : ""}`} aria-hidden="true">
      {initials || "?"}
    </span>
  )
}

export function Thumb({ src, hero, size }: { src: string | null | undefined; hero?: boolean; size?: "sm" | "stage" }) {
  const className = `thumb${size === "sm" ? " sm" : ""}${size === "stage" ? " stage" : ""}${hero ? " hero" : ""}`
  if (!src) return <span className={className} aria-hidden="true" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt="" />
}

/**
 * Compact list row: leading media or initials, title + meta, state and one action.
 * Primary action of a row is opening the object - the whole row is the link.
 */
export function ObjectRow({
  href,
  leading,
  title,
  meta,
  end,
}: {
  href?: string
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  end?: ReactNode
}) {
  const body = (
    <>
      {leading}
      <div className="object-row-main">
        <span className="object-row-title">{title}</span>
        {meta ? <span className="object-row-meta">{meta}</span> : null}
      </div>
      {end ? <div className="object-row-end">{end}</div> : null}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="object-row">
        {body}
      </Link>
    )
  }
  return <div className="object-row">{body}</div>
}
