import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge, Button, Container, Input, Text, toast } from "@medusajs/ui"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../errors/normalize-admin-error"
import {
  fetchProductWorkspaceBundle,
  stockAdminProductPath,
  updateAdminProduct,
  uploadAdminFiles,
} from "./admin-api.ts"
import {
  buildAttachPayload,
  buildGalleryView,
  buildImagesReplacementPayload,
  buildUnlinkPayload,
  filterGalleryCards,
  mediaFingerprint,
  moveId,
  validateUploadFile,
  type GalleryFilterId,
} from "./gallery-model.ts"
import { toRelativeMediaPath } from "./media-url.ts"
import type { AdminProductPayload } from "./types.ts"
import { buildStorefrontPreviewUrl } from "./preview-url.ts"

type Props = {
  product: AdminProductPayload
  onProductUpdated: (product: AdminProductPayload) => void
  onDirtyChange: (dirty: boolean) => void
}

type UploadRow = {
  key: string
  file: File
  status: "queued" | "uploading" | "uploaded" | "attach_failed" | "failed"
  error?: string
  uploadedUrl?: string
}

export const GalleryPanel = ({
  product,
  onProductUpdated,
  onDirtyChange,
}: Props) => {
  const gallery = useMemo(
    () =>
      buildGalleryView({
        product,
        stockAdminPath: stockAdminProductPath,
      }),
    [product]
  )

  const [filter, setFilter] = useState<GalleryFilterId>("all")
  const [query, setQuery] = useState("")
  const [orderIds, setOrderIds] = useState<string[] | null>(null)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [saving, setSaving] = useState(false)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState<string | null>(null)

  const authoritativeIds = useMemo(
    () =>
      (product.images ?? [])
        .map((i) => i.id)
        .filter((id): id is string => Boolean(id)),
    [product.images]
  )

  const workingIds = orderIds ?? authoritativeIds
  const reorderDirty =
    orderIds != null && orderIds.join(",") !== authoritativeIds.join(",")

  const markDirty = (dirty: boolean) => onDirtyChange(dirty)

  const setOrder = (ids: string[]) => {
    setOrderIds(ids)
    markDirty(ids.join(",") !== authoritativeIds.join(","))
  }

  const cardsById = useMemo(() => {
    const map = new Map(gallery.cards.map((c) => [c.image_id, c]))
    return map
  }, [gallery.cards])

  const orderedCards = workingIds
    .map((id, idx) => {
      const c = cardsById.get(id)
      if (!c) return null
      return {
        ...c,
        position: idx + 1,
        load_status: broken[id] ? ("broken" as const) : c.load_status,
      }
    })
    .filter(Boolean)

  const visible = filterGalleryCards(
    (orderedCards as typeof gallery.cards).map((c) => ({
      ...c,
      load_status: broken[c.image_id ?? ""] ? "broken" : c.load_status,
    })),
    filter,
    query
  )

  const preview = buildStorefrontPreviewUrl({
    productId: product.id,
    status: product.status,
  })

  const reloadAuthoritative = async () => {
    const bundle = await fetchProductWorkspaceBundle(product.id)
    if ("status" in bundle) {
      const err = normalizeAdminError({
        httpStatus: bundle.status,
        endpoint: `/admin/products/${product.id}`,
        body: bundle.body,
      })
      toast.error(formatAdminErrorPrimary(err))
      return null
    }
    onProductUpdated(bundle.product)
    return bundle.product
  }

  const ensureFresh = async (expectedFp: string) => {
    const fresh = await reloadAuthoritative()
    if (!fresh) return null
    const fp = mediaFingerprint(fresh)
    if (fp !== expectedFp) {
      toast.error(
        "Данные галереи изменились. Обновите страницу и повторите — сохранение отменено."
      )
      setOrderIds(null)
      markDirty(false)
      return null
    }
    return fresh
  }

  const cancelReorder = () => {
    setOrderIds(null)
    markDirty(false)
  }

  const saveReorder = async () => {
    if (!reorderDirty || !orderIds) return
    setSaving(true)
    try {
      const expectedFp = gallery.fingerprint
      const fresh = await ensureFresh(expectedFp)
      if (!fresh) return
      const built = buildImagesReplacementPayload({
        snapshot: fresh.images ?? [],
        nextOrderedIds: orderIds,
      })
      if (!built.ok) {
        toast.error("Нельзя сохранить порядок: неполный набор изображений.")
        return
      }
      const res = await updateAdminProduct(product.id, { images: built.images })
      if ("status" in res) {
        toast.error(
          formatAdminErrorPrimary(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: `/admin/products/${product.id}`,
              body: res.body,
            })
          )
        )
        return
      }
      const after = await reloadAuthoritative()
      if (!after) return
      const got = (after.images ?? []).map((i) => i.id).join(",")
      if (got !== orderIds.join(",")) {
        toast.error("Порядок на сервере не совпал с ожидаемым. Проверьте галерею.")
        return
      }
      setOrderIds(null)
      markDirty(false)
      toast.success("Порядок галереи сохранён")
    } catch (e) {
      toast.error(
        formatAdminErrorPrimary(
          normalizeAdminError({
            error: e,
            endpoint: `/admin/products/${product.id}`,
            codeHint: "network_error",
          })
        )
      )
    } finally {
      setSaving(false)
    }
  }

  const setThumbnail = async (url: string) => {
    setSaving(true)
    try {
      const res = await updateAdminProduct(product.id, { thumbnail: url })
      if ("status" in res) {
        toast.error(
          formatAdminErrorPrimary(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: `/admin/products/${product.id}`,
              body: res.body,
              codeHint: "validation",
            })
          )
        )
        return
      }
      const after = await reloadAuthoritative()
      if (!after) {
        toast.error(
          "Изменение принято, но экран не обновился. Обновите страницу перед следующей правкой."
        )
        return
      }
      const got = toRelativeMediaPath(after.thumbnail ?? "") || (after.thumbnail ?? "").trim()
      const expect = toRelativeMediaPath(url) || url.trim()
      if (got !== expect && (after.thumbnail ?? "").trim() !== url.trim()) {
        toast.error("Главное фото на сервере не совпало с выбранным.")
        return
      }
      toast.success("Главное фото обновлено")
    } finally {
      setSaving(false)
    }
  }

  const unlink = async (imageId: string) => {
    setSaving(true)
    try {
      const expectedFp = gallery.fingerprint
      const fresh = await ensureFresh(expectedFp)
      if (!fresh) return
      const built = buildUnlinkPayload({
        snapshot: fresh.images ?? [],
        removeId: imageId,
      })
      if (!built.ok) {
        toast.error(
          built.code === "last_image"
            ? "Нельзя убрать последнее изображение здесь. Откройте стандартную админку."
            : built.code === "snapshot_invalid"
              ? "В галерее есть кадры без ID или URL — откройте стандартную админку."
              : "Изображение не найдено."
        )
        return
      }
      const removing = (fresh.images ?? []).find((i) => i.id === imageId)
      const thumbHit =
        Boolean(fresh.thumbnail) &&
        removing?.url &&
        toRelativeMediaPath(fresh.thumbnail!) === toRelativeMediaPath(removing.url)

      const payload: {
        images: typeof built.images
        thumbnail?: string | null
      } = { images: built.images }
      if (thumbHit) {
        payload.thumbnail = built.nextThumbnailUrl
      }

      const res = await updateAdminProduct(product.id, payload)
      if ("status" in res) {
        toast.error(
          formatAdminErrorPrimary(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: `/admin/products/${product.id}`,
              body: res.body,
            })
          )
        )
        return
      }
      const after = await reloadAuthoritative()
      if (!after) {
        toast.error(
          "Изменение принято, но экран не обновился. Обновите страницу перед следующей правкой."
        )
        return
      }
      const afterIds = (after.images ?? []).map((i) => i.id).filter(Boolean) as string[]
      const expectedIds = built.images.map((i) => i.id).filter(Boolean) as string[]
      if (afterIds.join(",") !== expectedIds.join(",")) {
        toast.error("После сохранения галерея не совпала с ожидаемой. Проверьте стандартную админку.")
        return
      }
      if (thumbHit) {
        const got = toRelativeMediaPath(after.thumbnail ?? "")
        const expect = toRelativeMediaPath(built.nextThumbnailUrl ?? "")
        if (got !== expect && (after.thumbnail ?? "") !== (built.nextThumbnailUrl ?? "")) {
          toast.error("Главное фото после удаления не совпало с ожидаемым.")
          return
        }
      }
      setConfirmUnlink(null)
      toast.success(
        thumbHit
          ? "Изображение убрано. Главным назначено следующее в списке."
          : "Изображение убрано из галереи товара (файл в storage не удалялся)."
      )
    } finally {
      setSaving(false)
    }
  }

  const onPickFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const next: UploadRow[] = []
    for (const file of Array.from(fileList)) {
      const v = validateUploadFile(file)
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        status: v.ok ? "queued" : "failed",
        error: v.ok ? undefined : v.message,
      })
    }
    setUploads((prev) => [...prev, ...next])
  }

  const runUploads = async () => {
    const queued = uploads.filter((u) => u.status === "queued" || u.status === "failed")
    if (!queued.length) return
    setSaving(true)
    const uploadedUrls: string[] = []
    const nextRows = [...uploads]
    try {
      for (const row of queued) {
        const idx = nextRows.findIndex((r) => r.key === row.key)
        if (idx < 0) continue
        if (row.status === "failed" && row.error && !row.uploadedUrl) {
          const v = validateUploadFile(row.file)
          if (!v.ok) continue
        }
        nextRows[idx] = { ...nextRows[idx], status: "uploading", error: undefined }
        setUploads([...nextRows])
        const res = await uploadAdminFiles([row.file])
        if ("status" in res) {
          nextRows[idx] = {
            ...nextRows[idx],
            status: "failed",
            error: formatAdminErrorPrimary(
              normalizeAdminError({
                httpStatus: res.status,
                endpoint: "/admin/uploads",
                body: res.body,
                codeHint: "upload_error",
              })
            ),
          }
          setUploads([...nextRows])
          continue
        }
        const url = res.files[0]?.url
        if (!url) {
          nextRows[idx] = {
            ...nextRows[idx],
            status: "failed",
            error: "Сервер не вернул URL файла.",
          }
          setUploads([...nextRows])
          continue
        }
        const rel = toRelativeMediaPath(url) || url
        nextRows[idx] = {
          ...nextRows[idx],
          status: "uploaded",
          uploadedUrl: rel,
        }
        uploadedUrls.push(rel)
        setUploads([...nextRows])
      }

      if (!uploadedUrls.length) {
        toast.error("Ни один файл не загружен")
        return
      }

      const expectedFp = gallery.fingerprint
      const fresh = await ensureFresh(expectedFp)
      if (!fresh) {
        for (const url of uploadedUrls) {
          const idx = nextRows.findIndex((r) => r.uploadedUrl === url)
          if (idx >= 0) {
            nextRows[idx] = {
              ...nextRows[idx],
              status: "attach_failed",
              error:
                "Файл в storage есть, но не привязан к товару. Повторите добавление.",
            }
          }
        }
        setUploads([...nextRows])
        toast.error("Загрузка прошла, привязка отменена из‑за устаревших данных")
        return
      }

      const built = buildAttachPayload({
        snapshot: fresh.images ?? [],
        newUrls: uploadedUrls,
      })
      if (!built.ok) {
        toast.error("Нечего привязывать")
        return
      }
      const res = await updateAdminProduct(product.id, { images: built.images })
      if ("status" in res) {
        for (const url of uploadedUrls) {
          const idx = nextRows.findIndex((r) => r.uploadedUrl === url)
          if (idx >= 0) {
            nextRows[idx] = {
              ...nextRows[idx],
              status: "attach_failed",
              error: "Файл загружен, но не добавлен в галерею товара.",
            }
          }
        }
        setUploads([...nextRows])
        toast.error(
          formatAdminErrorPrimary(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: `/admin/products/${product.id}`,
              body: res.body,
            })
          )
        )
        return
      }
      await reloadAuthoritative()
      const after = await fetchProductWorkspaceBundle(product.id)
      if ("status" in after) {
        toast.error("Файлы загружены, но не удалось подтвердить галерею. Обновите страницу.")
        return
      }
      onProductUpdated(after.product)
      const afterUrls = new Set(
        (after.product.images ?? []).map((i) => toRelativeMediaPath(i.url ?? "") || (i.url ?? ""))
      )
      const missing = uploadedUrls.filter((u) => !afterUrls.has(toRelativeMediaPath(u) || u))
      if (missing.length) {
        toast.error(
          `Частичный результат: не найдены в галерее ${missing.length} из ${uploadedUrls.length} загруженных URL.`
        )
        setUploads((rows) =>
          rows.map((r) =>
            r.uploadedUrl && missing.includes(r.uploadedUrl)
              ? {
                  ...r,
                  status: "attach_failed",
                  error: "Файл загружен, но URL не найден в галерее после сохранения.",
                }
              : r
          )
        )
        return
      }
      const afterCount = (after.product.images ?? []).length
      const expectedCount = (fresh.images ?? []).length + uploadedUrls.length
      if (afterCount !== expectedCount) {
        toast.error(
          `Частичный результат: ожидали ${expectedCount} кадров, на сервере ${afterCount}.`
        )
        return
      }
      setUploads((rows) =>
        rows.map((r) =>
          r.uploadedUrl && uploadedUrls.includes(r.uploadedUrl)
            ? { ...r, status: "uploaded", error: undefined }
            : r
        )
      )
      toast.success(`Добавлено изображений: ${uploadedUrls.length}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text weight="plus">Галерея</Text>
          <Text size="small" className="text-ui-fg-subtle">
            SoT: thumbnail + product.images. Показано {visible.length} из{" "}
            {gallery.image_count}.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={gallery.status_label.includes("внимания") ? "orange" : "green"}>
            {gallery.status_label}
          </Badge>
          <Button size="small" variant="secondary" asChild>
            <a href={preview.url ?? "#"} target="_blank" rel="noreferrer">
              Предпросмотр на витрине
            </a>
          </Button>
          <Button size="small" variant="secondary" asChild>
            <Link to={gallery.stock_admin_path}>
              Открыть галерею в стандартной админке
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        {gallery.thumbnail_url ? (
          <img
            src={gallery.thumbnail_url}
            alt="Главное фото"
            className="h-20 w-20 object-cover rounded border"
          />
        ) : (
          <div className="h-20 w-20 rounded border flex items-center justify-center text-xs text-ui-fg-muted">
            Нет главного
          </div>
        )}
        <div className="text-sm space-y-1">
          <div>Изображений: {gallery.image_count}</div>
          <div>Точных дублей URL: {gallery.exact_duplicate_count}</div>
          {gallery.warnings.map((w) => (
            <div key={w} className="text-ui-fg-subtle">
              {w}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Text size="small">Поиск</Text>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя файла, URL…"
          />
        </div>
        <label className="text-sm">
          Фильтр{" "}
          <select
            className="border rounded px-2 py-1"
            value={filter}
            onChange={(e) => setFilter(e.target.value as GalleryFilterId)}
          >
            <option value="all">Все</option>
            <option value="main">Главное</option>
            <option value="duplicates">Точные дубли</option>
            <option value="broken">Недоступные</option>
            <option value="no_tech">Без ID / URL</option>
          </select>
        </label>
        <Button
          size="small"
          variant="secondary"
          onClick={() => {
            setQuery("")
            setFilter("all")
          }}
        >
          Сбросить
        </Button>
        {reorderDirty ? (
          <>
            <Button size="small" variant="secondary" onClick={cancelReorder} disabled={saving}>
              Отменить порядок
            </Button>
            <Button size="small" onClick={saveReorder} isLoading={saving}>
              Сохранить порядок
            </Button>
          </>
        ) : null}
      </div>

      <div className="border rounded p-3 space-y-2">
        <Text weight="plus">Загрузка</Text>
        <input
          aria-label="Выберите изображения"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={(e) => onPickFiles(e.target.files)}
        />
        {uploads.length ? (
          <ul className="text-sm space-y-1">
            {uploads.map((u) => (
              <li key={u.key}>
                {u.file.name} · {(u.file.size / 1024).toFixed(1)} КБ · {u.status}
                {u.error ? ` — ${u.error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          size="small"
          onClick={runUploads}
          disabled={saving || !uploads.some((u) => u.status === "queued" || u.status === "failed")}
          isLoading={saving}
        >
          Загрузить и добавить в галерею
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((card) => (
          <div
            key={card.image_id ?? card.url}
            className="border rounded p-2 space-y-2 bg-ui-bg-base"
          >
            <div className="relative aspect-square bg-ui-bg-subtle overflow-hidden rounded">
              {card.url ? (
                <img
                  src={card.url}
                  alt={card.label}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  onError={() => {
                    if (card.image_id) {
                      setBroken((b) => ({ ...b, [card.image_id!]: true }))
                    }
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs">Нет URL</div>
              )}
              {card.is_thumbnail ? (
                <Badge className="absolute top-1 left-1" color="green">
                  Главное
                </Badge>
              ) : null}
              <Badge className="absolute top-1 right-1">
                #{card.position}
              </Badge>
            </div>
            <Text size="small" weight="plus" className="truncate" title={card.label}>
              {card.label}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {card.format}
              {card.exact_duplicate ? " · точный дубль URL" : ""}
              {broken[card.image_id ?? ""] ? " · не загрузилось" : ""}
            </Text>
            <div className="flex flex-wrap gap-1">
              {card.image_id ? (
                <>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={saving || !card.url}
                    onClick={() => setThumbnail(card.url)}
                  >
                    Сделать главным
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => setOrder(moveId(workingIds, card.image_id!, "up"))}
                  >
                    ↑
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => setOrder(moveId(workingIds, card.image_id!, "down"))}
                  >
                    ↓
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => setOrder(moveId(workingIds, card.image_id!, "start"))}
                  >
                    В начало
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => setOrder(moveId(workingIds, card.image_id!, "end"))}
                  >
                    В конец
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    disabled={saving || gallery.image_count <= 1}
                    onClick={() => setConfirmUnlink(card.image_id)}
                  >
                    Убрать
                  </Button>
                </>
              ) : null}
              <Button
                size="small"
                variant="transparent"
                onClick={() =>
                  setTechOpen(techOpen === (card.image_id ?? card.url) ? null : card.image_id ?? card.url)
                }
              >
                Технические сведения
              </Button>
            </div>
            {techOpen === (card.image_id ?? card.url) ? (
              <Text size="small" className="break-all text-ui-fg-muted">
                id: {card.image_id ?? "—"}
                <br />
                url: {card.url || "—"}
              </Text>
            ) : null}
          </div>
        ))}
      </div>

      {!visible.length ? (
        <Text className="text-ui-fg-subtle">Нет изображений по текущему фильтру.</Text>
      ) : null}

      {confirmUnlink ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmUnlink(null)
          }}
        >
          <Container className="p-4 max-w-md space-y-3 bg-ui-bg-base">
            <Text weight="plus">Убрать изображение из галереи?</Text>
            <Text size="small">
              Картинка будет отвязана только от этого товара. Файл в storage Package D не
              удаляет. Если это главное фото — главным станет следующее в списке.
            </Text>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmUnlink(null)}>
                Отмена
              </Button>
              <Button
                variant="danger"
                isLoading={saving}
                onClick={() => unlink(confirmUnlink)}
              >
                Убрать из товара
              </Button>
            </div>
          </Container>
        </div>
      ) : null}
    </Container>
  )
}
