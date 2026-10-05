"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { OPEN_SEARCH_EVENT } from "@/components/desk-nav"
import { COMMANDS } from "@/lib/commands"

type Hit = { id: string; group: string; title: string; hint: string | null; href: string }


const GROUP_LABEL: Record<string, string> = {
  order: "Заказ",
  product: "Товар",
  person: "Человек",
  request: "Заявка",
  command: "Команда",
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // Native modal: focus trapped inside, Esc closes, focus returns to the trigger.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

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
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  }, [])

  const query = q.trim()

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

  const rows = useMemo(() => {
    const needle = query.toLowerCase()
    const commands: Hit[] = COMMANDS.filter((command) => !needle || command.title.toLowerCase().includes(needle)).map(
      (command) => ({ id: command.href, group: "command", title: command.title, hint: command.hint, href: command.href })
    )
    return [...(query.length >= 2 ? hits : []), ...commands]
  }, [hits, query])

  const activeIndex = Math.min(cursor, Math.max(0, rows.length - 1))

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOpen(true)} aria-label="Поиск и команды">
        <SearchGlyph />
        <span className="search-hint">Найти человека, заказ, товар…</span>
        <kbd className="kbd">⌘K</kbd>
      </button>
      <dialog
        ref={dialogRef}
        className="palette"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false)
          setQ("")
        }}
        onMouseDown={(event) => {
          if (event.target === dialogRef.current) setOpen(false)
        }}
      >
        <h2 id={titleId} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Поиск и команды
        </h2>
        <div className="palette-input">
          <SearchGlyph />
          <input
            ref={inputRef}
            aria-label="Запрос"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${titleId}-list`}
            aria-activedescendant={rows[activeIndex] ? `${titleId}-opt-${activeIndex}` : undefined}
            aria-autocomplete="list"
            value={q}
            placeholder="Имя, телефон, почта, номер заказа, SKU"
            onChange={(event) => {
              setQ(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setCursor(Math.min(rows.length - 1, activeIndex + 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setCursor(Math.max(0, activeIndex - 1))
              } else if (event.key === "Enter" && rows[activeIndex]) {
                event.preventDefault()
                go(rows[activeIndex]!.href)
              }
            }}
          />
        </div>
        <div className="palette-list" role="listbox" aria-label="Результаты" id={`${titleId}-list`}>
          {error ? <p className="error">{error}</p> : null}
          {query.length >= 2 && hits.length === 0 && !error ? <p className="meta palette-group">Совпадений нет. Ниже - команды</p> : null}
          {rows.map((hit, index) => (
            <a
              key={`${hit.group}:${hit.id}`}
              id={`${titleId}-opt-${index}`}
              href={hit.href}
              role="option"
              aria-selected={index === activeIndex}
              className="palette-hit"
              onMouseEnter={() => setCursor(index)}
              onClick={(event) => {
                event.preventDefault()
                go(hit.href)
              }}
            >
              <span className="meta palette-kind">{GROUP_LABEL[hit.group] ?? hit.group}</span>
              <span className="palette-title">{hit.title}</span>
              {hit.hint ? <span className="meta">{hit.hint}</span> : null}
            </a>
          ))}
        </div>
        <div className="palette-foot">
          <span className="meta">Enter открыть</span>
          <span className="meta">↑↓ выбрать</span>
          <span className="meta">Esc закрыть</span>
          <span className="meta">Команды только открывают объект</span>
        </div>
      </dialog>
    </>
  )
}

function SearchGlyph() {
  return (
    <svg className="search-glyph" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  )
}
