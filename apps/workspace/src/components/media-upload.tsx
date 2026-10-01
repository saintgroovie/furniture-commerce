"use client"

import { useState } from "react"

export function MediaUpload({ productId }: { productId: string }) {
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  function onFile(file: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
    setMessage("")
    setFailed(false)
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
        const input = event.currentTarget.querySelector<HTMLInputElement>("input[type=file]")
        if (file && input) {
          const list = new DataTransfer()
          list.items.add(file)
          input.files = list.files
          onFile(file)
        }
      }}
      onSubmit={(event) => {
        const form = event.currentTarget
        const file = form.querySelector<HTMLInputElement>("input[type=file]")?.files?.[0]
        if (!file || !window.XMLHttpRequest) return
        event.preventDefault()
        const xhr = new XMLHttpRequest()
        xhr.open("POST", form.action)
        xhr.setRequestHeader("x-desk-upload", "1")
        xhr.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) return
          setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        }
        xhr.onload = () => {
          setProgress(null)
          if (xhr.status >= 200 && xhr.status < 400) {
            window.location.assign(`/catalog/${productId}?saved=1#media`)
            return
          }
          setFailed(true)
          try {
            const payload = JSON.parse(xhr.responseText) as { message?: string }
            setMessage(payload.message || "Не удалось загрузить кадр")
          } catch {
            setMessage("Не удалось загрузить кадр")
          }
        }
        xhr.onerror = () => {
          setProgress(null)
          setFailed(true)
          setMessage("Не удалось загрузить кадр")
        }
        setFailed(false)
        setMessage("Загрузка…")
        setProgress(0)
        xhr.send(new FormData(form))
      }}
    >
      <p className="muted">JPEG, PNG или WebP до 8 МБ. Кадр не становится главным сам и не публикует товар</p>
      <label>
        Файл
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {preview ? <img src={preview} alt="Предпросмотр кадра" width={160} height={120} /> : null}
      {progress != null ? (
        <p>
          <progress value={progress} max={100}>{progress}%</progress>
          {" "}
          {progress}%
        </p>
      ) : null}
      {message ? <p className={failed ? "toast warn" : "muted"} role={failed ? "alert" : "status"}>{message}</p> : null}
      <button className="primary" type="submit">Загрузить кадр</button>
    </form>
  )
}
