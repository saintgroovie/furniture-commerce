import { Badge, Button, Container, Heading, Input, Label, StatusBadge, Text } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type {
  CatalogPromoAdminProduct,
  CatalogPromoAdminState,
} from "../../../../lib/woodright-admin/catalog-promo-admin"
import { PROMOTION_SLOT_MAX_PRODUCTS } from "../../../../modules/promotion-slot/slot-contract"
import {
  blockerLabel,
  formatRubAdmin,
  formatScheduleRu,
  isoToLocalInput,
  localInputToIso,
  moveItem,
  slotStatusLabel,
} from "../../../components/woodright/catalog-promo-labels"
import { adminJson, sellerErrorMessage } from "../../../lib/admin-fetch"
import { useDirtyGuard } from "../../../lib/use-dirty-guard"

type PreviewResponse = {
  active: boolean
  visible: boolean
  items: Array<{
    product_id: string
    title: string | null
    thumbnail: string | null
    sale_price: number
    original_price: number
    discount_percent: number
  }>
  skipped: Array<{ product_id: string; reason: string }>
}

type SlotForm = {
  enabled: boolean
  label: string
  product_ids: string[]
  starts_at: string
  ends_at: string
  rotation_interval_ms: number
}

function formFromState(state: CatalogPromoAdminState): SlotForm {
  return {
    enabled: state.slot.enabled,
    label: state.slot.label ?? "",
    product_ids: [...state.slot.product_ids],
    starts_at: isoToLocalInput(state.slot.starts_at),
    ends_at: isoToLocalInput(state.slot.ends_at),
    rotation_interval_ms: state.slot.rotation_interval_ms,
  }
}

function DiscountEditor({
  product,
  onChanged,
}: {
  product: CatalogPromoAdminProduct
  onChanged: (next: CatalogPromoAdminProduct) => void
}) {
  const [percent, setPercent] = useState(
    product.discount_percent != null ? String(product.discount_percent) : "10"
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (product.discount_percent != null) setPercent(String(product.discount_percent))
  }, [product.discount_percent])

  const apply = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const json = await adminJson<{ product: CatalogPromoAdminProduct }>(
        `/admin/woodright/catalog-promo/products/${product.product_id}/discount`,
        { method: "PUT", body: JSON.stringify(body) }
      )
      onChanged(json.product)
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить скидку"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`pct-${product.product_id}`} size="small">
            Скидка, %
          </Label>
          <Input
            id={`pct-${product.product_id}`}
            type="number"
            min={1}
            max={99}
            className="w-24"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            disabled={busy || product.base_price == null}
          />
        </div>
        <Button
          size="small"
          variant="secondary"
          disabled={busy || product.base_price == null}
          onClick={() => void apply({ percent: Number(percent) })}
        >
          {product.sale_price != null ? "Обновить скидку" : "Задать скидку"}
        </Button>
        {product.sale_price != null && (
          <Button
            size="small"
            variant="transparent"
            disabled={busy}
            onClick={() => void apply({ clear: true })}
          >
            Убрать скидку
          </Button>
        )}
      </div>
      {error && (
        <Text size="xsmall" className="text-ui-fg-error">
          {error}
        </Text>
      )}
    </div>
  )
}

const CatalogPromoPage = () => {
  const [state, setState] = useState<CatalogPromoAdminState | null>(null)
  const [products, setProducts] = useState<CatalogPromoAdminProduct[]>([])
  const [form, setForm] = useState<SlotForm | null>(null)
  const [saved, setSaved] = useState<SlotForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CatalogPromoAdminProduct[]>([])
  const [searching, setSearching] = useState(false)

  const dirty = form != null && saved != null && JSON.stringify(form) !== JSON.stringify(saved)
  useDirtyGuard(dirty)

  const applyState = useCallback((next: CatalogPromoAdminState) => {
    setState(next)
    setProducts(next.products)
    const f = formFromState(next)
    setForm(f)
    setSaved(f)
  }, [])

  const loadPreview = useCallback(async () => {
    try {
      setPreview(await adminJson<PreviewResponse>("/admin/woodright/catalog-promo/preview"))
    } catch {
      setPreview(null)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const json = await adminJson<CatalogPromoAdminState>("/admin/woodright/catalog-promo")
      applyState(json)
      await loadPreview()
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить промо-окно"))
    } finally {
      setLoading(false)
    }
  }, [applyState, loadPreview])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const json = await adminJson<{ products: CatalogPromoAdminProduct[] }>(
          `/admin/woodright/catalog-promo/products?q=${encodeURIComponent(q)}`
        )
        if (!cancelled) setResults(json.products)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const productById = useMemo(() => {
    const m = new Map<string, CatalogPromoAdminProduct>()
    for (const p of products) m.set(p.product_id, p)
    for (const p of results) if (!m.has(p.product_id)) m.set(p.product_id, p)
    return m
  }, [products, results])

  const save = async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const json = await adminJson<CatalogPromoAdminState>("/admin/woodright/catalog-promo", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.enabled,
          label: form.label.trim() || null,
          product_ids: form.product_ids,
          starts_at: localInputToIso(form.starts_at),
          ends_at: localInputToIso(form.ends_at),
          rotation_interval_ms: form.rotation_interval_ms,
        }),
      })
      applyState(json)
      await loadPreview()
      setNote("Сохранено - сайт обновится в течение минуты")
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить промо-окно"))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (enabled: boolean) => {
    if (!form) return
    setForm({ ...form, enabled })
  }

  const addProduct = (p: CatalogPromoAdminProduct) => {
    if (!form || form.product_ids.includes(p.product_id)) return
    if (form.product_ids.length >= PROMOTION_SLOT_MAX_PRODUCTS) {
      setError(`В промо-окне не больше ${PROMOTION_SLOT_MAX_PRODUCTS} товаров`)
      return
    }
    setProducts((prev) => (prev.some((x) => x.product_id === p.product_id) ? prev : [...prev, p]))
    setForm({ ...form, product_ids: [...form.product_ids, p.product_id] })
    setQuery("")
    setResults([])
  }

  const removeProduct = (id: string) => {
    if (!form) return
    setForm({ ...form, product_ids: form.product_ids.filter((x) => x !== id) })
  }

  const onProductChanged = (next: CatalogPromoAdminProduct) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.product_id === next.product_id)
      if (idx === -1) return [...prev, next]
      const copy = [...prev]
      copy[idx] = next
      return copy
    })
    void loadPreview()
  }

  const visibleCount = preview?.items.length ?? 0
  const scheduleActive = (() => {
    if (!state) return true
    const now = Date.now()
    const s = state.slot.starts_at ? new Date(state.slot.starts_at).getTime() : null
    const e = state.slot.ends_at ? new Date(state.slot.ends_at).getTime() : null
    return (s == null || s <= now) && (e == null || e > now)
  })()
  const status = slotStatusLabel({
    enabled: state?.slot.enabled ?? false,
    visibleCount,
    scheduleActive,
  })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Link to="/woodright" className="text-ui-fg-subtle text-sm">
          Woodright
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Heading>Промо в каталоге</Heading>
          <StatusBadge color={status.tone}>{status.text}</StatusBadge>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Одна карточка в первом ряду каталога показывает по очереди товары со скидкой
        </Text>
      </div>

      {loading && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем…
          </Text>
        </div>
      )}
      {error && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      )}

      {form && state && (
        <>
          <section className="flex flex-col gap-3 px-6 py-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => void toggleEnabled(e.target.checked)}
                data-testid="promo-enabled"
              />
              <span>Показывать промо-окно в каталоге</span>
            </label>
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-label">Подпись на карточке</Label>
              <Input
                id="promo-label"
                value={form.label}
                maxLength={40}
                placeholder="Специальная цена"
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="promo-starts">Показывать с</Label>
                <Input
                  id="promo-starts"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="promo-ends">Показывать до</Label>
                <Input
                  id="promo-ends"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="promo-interval">Смена товара, секунд</Label>
                <Input
                  id="promo-interval"
                  type="number"
                  min={6}
                  max={8}
                  className="w-24"
                  value={Math.round(form.rotation_interval_ms / 1000)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rotation_interval_ms: Math.min(8, Math.max(6, Number(e.target.value) || 7)) * 1000,
                    })
                  }
                />
              </div>
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {formatScheduleRu(localInputToIso(form.starts_at), localInputToIso(form.ends_at))}
            </Text>
          </section>

          <section className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Товары в промо-окне</Heading>
            {form.product_ids.length === 0 && (
              <Text size="small" className="text-ui-fg-subtle">
                Пока пусто - найдите товар ниже и добавьте
              </Text>
            )}
            <ol className="flex flex-col gap-3" data-testid="promo-products">
              {form.product_ids.map((id, index) => {
                const p = productById.get(id)
                const blocker = p ? blockerLabel(p.blocker) : "Товар не найден"
                return (
                  <li
                    key={id}
                    className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-3"
                    data-product-id={id}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {p?.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-md bg-ui-bg-subtle" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Text weight="plus">
                            {index + 1}. {p?.title ?? id}
                          </Text>
                          {p?.sku && <Badge size="2xsmall">{p.sku}</Badge>}
                          {p?.discount_percent != null && (
                            <Badge size="2xsmall" color="green">
                              −{p.discount_percent}%
                            </Badge>
                          )}
                        </div>
                        <Text size="small" className="text-ui-fg-subtle">
                          Обычная цена: {formatRubAdmin(p?.base_price)}
                          {p?.sale_price != null && (
                            <> · Со скидкой: {formatRubAdmin(p.sale_price)}</>
                          )}
                        </Text>
                        {p?.buyer_sale_price != null && p.buyer_base_price != null && (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            На карточке: от {formatRubAdmin(p.buyer_sale_price)} вместо{" "}
                            {formatRubAdmin(p.buyer_base_price)}
                          </Text>
                        )}
                        {blocker && (
                          <Text size="xsmall" className="text-ui-fg-error">
                            {blocker}
                          </Text>
                        )}
                        {p && <DiscountEditor product={p} onChanged={onProductChanged} />}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="small"
                          variant="transparent"
                          disabled={index === 0}
                          aria-label="Выше"
                          onClick={() =>
                            setForm({ ...form, product_ids: moveItem(form.product_ids, index, index - 1) })
                          }
                        >
                          ↑
                        </Button>
                        <Button
                          size="small"
                          variant="transparent"
                          disabled={index === form.product_ids.length - 1}
                          aria-label="Ниже"
                          onClick={() =>
                            setForm({ ...form, product_ids: moveItem(form.product_ids, index, index + 1) })
                          }
                        >
                          ↓
                        </Button>
                        <Button
                          size="small"
                          variant="transparent"
                          onClick={() => removeProduct(id)}
                        >
                          Убрать
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-search">Добавить товар</Label>
              <Input
                id="promo-search"
                placeholder="Название, артикул или адрес"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {searching && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Ищем…
                </Text>
              )}
              {results.length > 0 && (
                <ul className="flex flex-col divide-y rounded-lg border border-ui-border-base">
                  {results
                    .filter((r) => !form.product_ids.includes(r.product_id))
                    .map((r) => (
                      <li key={r.product_id} className="flex items-center gap-3 p-2">
                        {r.thumbnail ? (
                          <img src={r.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-ui-bg-subtle" />
                        )}
                        <div className="min-w-0 flex-1">
                          <Text size="small" weight="plus">
                            {r.title}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {r.sku ?? r.handle} · {formatRubAdmin(r.base_price)}
                          </Text>
                        </div>
                        <Button size="small" variant="secondary" onClick={() => addProduct(r)}>
                          Добавить
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2 px-6 py-4">
            <Heading level="h2">Скидки</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Скидки хранятся в прайс-листе «{state.price_list.title ?? "Промо в каталоге"}» -{" "}
              {state.price_list.active_now ? "действует сейчас" : "сейчас не действует"}
              {" · "}
              {formatScheduleRu(state.price_list.starts_at, state.price_list.ends_at)}
            </Text>
            {state.price_list.admin_path && (
              <a
                href={state.price_list.admin_path}
                className="text-ui-fg-interactive text-sm"
                target="_blank"
                rel="noreferrer"
              >
                Открыть прайс-лист в Medusa - расписание и расширенные настройки
              </a>
            )}
          </section>

          <section className="flex flex-col gap-2 px-6 py-4">
            <Heading level="h2">Что сейчас видит покупатель</Heading>
            {!preview || !preview.visible ? (
              <Text size="small" className="text-ui-fg-subtle">
                Промо-окно не показывается - каталог обычный
              </Text>
            ) : (
              <ul className="flex flex-wrap gap-3" data-testid="promo-preview">
                {preview.items.map((item) => (
                  <li
                    key={item.product_id}
                    className="flex w-44 flex-col gap-1 rounded-lg border border-ui-border-base p-2"
                  >
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt="" className="aspect-square w-full rounded object-cover" />
                    )}
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {form.label.trim() || "Специальная цена"}
                    </Text>
                    <Text size="small" weight="plus">
                      {item.title}
                    </Text>
                    <Text size="small">
                      от {formatRubAdmin(item.sale_price)}{" "}
                      <span className="text-ui-fg-subtle line-through">
                        {formatRubAdmin(item.original_price)}
                      </span>
                    </Text>
                  </li>
                ))}
              </ul>
            )}
            {preview && preview.skipped.length > 0 && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Не показываются: {preview.skipped.length}
              </Text>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3 px-6 py-4">
            <Button onClick={() => void save()} disabled={saving || !dirty} data-testid="promo-save">
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
            {dirty && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Есть несохранённые изменения
              </Text>
            )}
            {note && (
              <Text size="small" className="text-ui-fg-subtle">
                {note}
              </Text>
            )}
          </div>
        </>
      )}
    </Container>
  )
}

export default CatalogPromoPage
