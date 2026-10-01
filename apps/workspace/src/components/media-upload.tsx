"use client"

import { useRef, useState } from "react"

type Phase = { kind: "idle" } | { kind: "uploading"; progress: number } | { kind: "failed"; message: string }

/**
 * Upload with real progress. Success = server redirect back to the product
 * with `saved=1`; failure stays on screen with a retry, no optimistic frame.
 */
export function MediaUpload({ productId }: { productId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function onFile(file: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
    setFileName(file?.name ?? null)
    setPhase({ kind: "idle" })
  }

  return (
    <form
      action={`/api/catalog/${productId}/media`}
      method="post"
      encType="multipart/form-data"
      className="stack"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        if (file && inputRef.current) {
          const list = new DataTransfer()
          list.items.add(file)
          inputRef.current.files = list.files
          onFile(file)
        }
      }}
      onSubmit={(event) => {
        const form = event.currentTarget
        const file = inputRef.current?.files?.[0]
        if (!file || !window.XMLHttpRequest) return
        event.preventDefault()
        const xhr = new XMLHttpRequest()
        xhr.open("POST", form.action)
        xhr.setRequestHeader("x-desk-upload", "1")
        xhr.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) return
          setPhase({ kind: "uploading", progress: Math.round((progressEvent.loaded / progressEvent.total) * 100) })
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 400) {
            window.location.assign(`/catalog/${productId}?saved=1#media`)
            return
          }
          let message = "Не удалось загрузить кадр"
          try {
            const payload = JSON.parse(xhr.responseText) as { message?: string }
            if (payload.message) message = payload.message
          } catch {
            // keep default wording
          }
          setPhase({ kind: "failed", message })
        }
        xhr.onerror = () => setPhase({ kind: "failed", message: "Не удалось загрузить кадр. Проверьте связь" })
        setPhase({ kind: "uploading", progress: 0 })
        xhr.send(new FormData(form))
      }}
    >
      <label className={`dropzone${phase.kind === "failed" ? " failed" : ""}`}>
        {preview ? <img src={preview} alt="Предпросмотр кадра" width={96} height={72} /> : <span className="dropzone-glyph" aria-hidden="true">＋</span>}
        <span className="object-row-title">{fileName ?? "Перетащите кадр или выберите файл"}</span>
        <span className="meta">JPEG, PNG или WebP до 8 МБ. Кадр не станет главным сам и не опубликует товар</span>
        <input ref={inputRef} className="sr-only" type="file" name="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      </label>
      {phase.kind === "uploading" ? (
        <p role="status" className="meta">
          <progress value={phase.progress} max={100}>{phase.progress}%</progress> Загружаем… {phase.progress}%
        </p>
      ) : null}
      {phase.kind === "failed" ? (
        <p role="alert" className="banner critical">
          {phase.message}. Файл остался в форме, можно повторить
        </p>
      ) : null}
      <button className="btn btn-secondary" type="submit" disabled={phase.kind === "uploading"}>
        {phase.kind === "failed" ? "Повторить загрузку" : "Загрузить кадр"}
      </button>
    </form>
  )
}
