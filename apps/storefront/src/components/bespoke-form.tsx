"use client"

import type { KeyboardEvent } from "react"
import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createLead } from "@/lib/api/leads"
import { createBespokeRequest } from "@/lib/api/bespoke-requests"
import { bespokeForm as copy, bespokeRequestCopy, designersLandingCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { flatCopy } from "@/lib/format-ru-copy"

type Status = "idle" | "submitting" | "success" | "error_validation" | "error_server"
type TaskOption = { value: string; label: string }

/**
 * Custom listbox-style dropdown for "Что нужно рассчитать" - same interaction
 * pattern as CatalogSortDropdown (click/hover/Enter/Esc/outside-click), but
 * full-width and styled to look like a form input in its closed state.
 */
function TaskTypeSelect({
  id,
  options,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string
  options: TaskOption[]
  placeholder: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)))
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const openList = () => {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const commit = (idx: number) => {
    const opt = options[idx]
    setOpen(false)
    buttonRef.current?.focus()
    if (opt) onChange(opt.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (open) setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        else openList()
        break
      case "ArrowUp":
        e.preventDefault()
        if (open) setActiveIndex((i) => Math.max(0, i - 1))
        else openList()
        break
      case "Home":
        if (open) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case "End":
        if (open) {
          e.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case "Enter":
      case " ":
        e.preventDefault()
        if (open) commit(activeIndex)
        else openList()
        break
      case "Escape":
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        break
      case "Tab":
        setOpen(false)
        break
    }
  }

  return (
    <div className="wr-select wr-select--field" ref={rootRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        role="combobox"
        className={`wr-select-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-opt-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={`wr-select-value${selected ? "" : " is-placeholder"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="wr-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="wr-select-menu" role="listbox" id={listboxId}>
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            const isActive = idx === activeIndex
            return (
              <li
                key={opt.value}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={`wr-select-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                onPointerEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
              >
                {opt.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function BespokeForm() {
  const searchParams = useSearchParams()
  const productId = searchParams.get("product_id") ?? undefined
  const roomSetId = searchParams.get("room_set_id") ?? undefined
  /* Материальное исполнение, выбранное на PDP (label из product contract). */
  const materialLabel = searchParams.get("material")?.trim() || undefined
  const fromDesigners = searchParams.get("from") === "designers"

  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [nameError, setNameError] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [taskType, setTaskType] = useState("")
  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submittingRef.current) return
    const form = e.currentTarget
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() ?? ""
    const phone = (form.elements.namedItem("phone") as HTMLInputElement)?.value?.trim() ?? ""
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim() ?? ""
    const city = (form.elements.namedItem("city") as HTMLInputElement)?.value?.trim() ?? ""
    const commentRaw = (form.elements.namedItem("comment") as HTMLTextAreaElement)?.value?.trim() ?? ""

    const nextNameError = name ? "" : copy.nameRequired
    const nextPhoneError = phone ? "" : flatCopy(copy.phoneRequired)
    setNameError(nextNameError)
    setPhoneError(nextPhoneError)
    if (nextNameError || nextPhoneError) {
      setStatus("error_validation")
      return
    }

    // city и task_type - frontend-only уточнения; API их отдельно не поддерживает,
    // поэтому аккуратно добавляем выбор первыми строками в общий comment.
    const taskLabel = copy.taskOptions.find((option) => option.value === taskType)?.label
    const headerLines = [
      fromDesigners ? designersLandingCopy.requestContext : null,
      city ? `${copy.fields.city}: ${city}` : null,
      taskLabel ? `${copy.fields.taskType}: ${taskLabel}` : null,
      materialLabel ? `Исполнение: ${materialLabel}` : null,
    ].filter((line): line is string => Boolean(line))
    const comment = headerLines.length
      ? `${headerLines.join("\n")}${commentRaw ? `\n\n${commentRaw}` : ""}`
      : commentRaw

    submittingRef.current = true
    setStatus("submitting")
    setErrorMessage("")
    try {
      const leadRes = await createLead({
        source: roomSetId ? "room_adapt" : "bespoke",
        name: name || null,
        email: email || null,
        phone: phone || null,
        comment: comment || null,
        payload: fromDesigners
          ? { audience: "designer", intent: "partnership" }
          : null,
      })
      const leadId = (leadRes.lead as { id?: string })?.id
      if (!leadId) throw new Error("No lead id")
      await createBespokeRequest({
        lead_id: leadId,
        product_id: productId ?? null,
        room_set_id: roomSetId ?? null,
        materials: materialLabel ?? null,
        comment: comment || null,
      })
      setStatus("success")
    } catch {
      setStatus("error_server")
      setErrorMessage(flatCopy(copy.serverError))
    } finally {
      submittingRef.current = false
    }
  }

  if (status === "success") {
    return (
      <div data-state="success" className="request-success">
        <p className="request-success-title">{copy.successTitle}</p>
        <CopyLines className="request-success-text" lines={copy.successBody} />
        <Link href="/catalog" className="btn btn-primary">{copy.successCta}</Link>
      </div>
    )
  }

  const submitting = status === "submitting"

  return (
    <>
      <h2 className="bespoke-request-card-title">{bespokeRequestCopy.formTitle}</h2>
      <CopyLines className="page-caption bespoke-request-card-caption" lines={bespokeRequestCopy.formCaption} />

      <form onSubmit={handleSubmit} data-state={status} className="form-stack bespoke-form">
        <div className="form-field">
          <label htmlFor="bespoke-name">
            {copy.fields.name}
            <span className="form-required-mark" aria-hidden="true"> *</span>
          </label>
          <input
            id="bespoke-name"
            name="name"
            type="text"
            placeholder={copy.placeholders.name}
            disabled={submitting}
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "bespoke-name-error" : undefined}
          />
          {nameError && (
            <span id="bespoke-name-error" className="feedback-error" role="alert">{nameError}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="bespoke-phone">
            {copy.fields.phone}
            <span className="form-required-mark" aria-hidden="true"> *</span>
          </label>
          <input
            id="bespoke-phone"
            name="phone"
            type="tel"
            placeholder={copy.placeholders.phone}
            disabled={submitting}
            aria-required="true"
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? "bespoke-phone-error" : undefined}
          />
          {phoneError && (
            <span id="bespoke-phone-error" className="feedback-error" role="alert">{phoneError}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="bespoke-email">{copy.fields.email}</label>
          <input id="bespoke-email" name="email" type="email" placeholder={copy.placeholders.email} disabled={submitting} />
        </div>

        <div className="form-field">
          <label htmlFor="bespoke-city">{copy.fields.city}</label>
          <input id="bespoke-city" name="city" type="text" placeholder={copy.placeholders.city} disabled={submitting} />
        </div>

        <div className="form-field">
          <label htmlFor="bespoke-task-type">{copy.fields.taskType}</label>
          <TaskTypeSelect
            id="bespoke-task-type"
            options={copy.taskOptions}
            placeholder={copy.taskPlaceholder}
            value={taskType}
            onChange={setTaskType}
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="bespoke-comment">{copy.fields.comment}</label>
          <textarea id="bespoke-comment" name="comment" placeholder={copy.placeholders.comment} disabled={submitting} rows={4} />
        </div>

        {productId && <input type="hidden" name="product_id" value={productId} />}
        {roomSetId && <input type="hidden" name="room_set_id" value={roomSetId} />}

        <button type="submit" className="btn btn-primary bespoke-submit-btn" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </button>

        <CopyLines className="form-consent-note" lines={copy.consentNote} />
        <p className="form-consent-links">
          <Link href="/privacy">{copy.consentPrivacyLabel}</Link>
        </p>

        {status === "error_server" && (
          <div className="form-alert-error" role="alert">{errorMessage}</div>
        )}
      </form>
    </>
  )
}
