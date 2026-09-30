"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Hit = { id: string; group: string; title: string; hint: string | null; href: string }

const COMMANDS = [
  { title: "Открыть Сегодня", href: "/today" },
  { title: "Открыть Заказы", href: "/orders" },
  { title: "Открыть Каталог", href: "/catalog" },
  { title: "Открыть Людей", href: "/people" },
  { title: "Открыть Заявки", href: "/requests" },
]

const GROUP_LABEL: Record<string, string> = {
  order: "Заказы",
  product: "Каталог",
  person: "Люди",
  request: "Заявки",
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      } else if (event.key === "/" && !typing) {
        event.preventDefault()
        setOpen(true)
      } else if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const query = q.trim()
  const visibleHits = query.length < 2 ? [] : hits

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || query.length < 2) return
    const handle = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error("fail")
          const json = (await response.json()) as { hits: Hit[] }
          setHits(json.hits ?? [])
          setError(null)
        })
        .catch(() => setError("Поиск не загрузился"))
    }, 250)
    return () => window.clearTimeout(handle)
  }, [open, query])

  if (!open) {
    return (
      <button type="button" className="search-trigger" onClick={() => setOpen(true)}>
        Найти заказ, товар или человека
      </button>
    )
  }

  return (
    <div className="modal-back" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Поиск</h2>
        <input
          ref={inputRef}
          aria-label="Запрос"
          value={q}
          placeholder="Номер, SKU, почта, телефон"
          onChange={(event) => setQ(event.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="hits">
          {COMMANDS.filter((command) => command.title.toLowerCase().includes(q.trim().toLowerCase()) || !q.trim()).map((command) => (
            <a
              key={command.href}
              href={command.href}
              onClick={(event) => {
                event.preventDefault()
                setOpen(false)
                router.push(command.href)
              }}
            >
              {command.title}
            </a>
          ))}
            {visibleHits.map((hit) => (
            <a
              key={`${hit.group}:${hit.id}`}
              href={hit.href}
              onClick={(event) => {
                event.preventDefault()
                setOpen(false)
                router.push(hit.href)
              }}
            >
              <span className="muted">{GROUP_LABEL[hit.group] ?? hit.group}</span>
              <strong style={{ display: "block" }}>{hit.title}</strong>
              {hit.hint ? <span className="muted">{hit.hint}</span> : null}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
