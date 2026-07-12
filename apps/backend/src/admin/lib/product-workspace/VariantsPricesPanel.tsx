import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge, Button, Container, Input, Text, toast } from "@medusajs/ui"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../errors/normalize-admin-error"
import { updateAdminProductVariant, fetchProductWorkspaceBundle, stockAdminProductPath } from "./admin-api.ts"
import { buildBulkPricePreview, type BulkPriceOp } from "./bulk-price.ts"
import { buildClassificationView } from "./classification.ts"
import { formatMajorMoney, parseMajorPriceInput } from "./price-input.ts"
import { buildVariantPricesPayload } from "./price-payload.ts"
import type { AdminProductPayload } from "./types.ts"
import {
  filterVariantRows,
  sortVariantRows,
  type VariantFilterId,
  type VariantSortId,
} from "./variant-filters.ts"
import { buildVariantMatrix } from "./variant-matrix.ts"
import type { VariantMatrixRow } from "./variant-matrix-types.ts"

type Props = {
  product: AdminProductPayload
  truncated?: boolean
  onProductUpdated: (product: AdminProductPayload) => void
  onDirtyChange: (dirty: boolean) => void
}

export const VariantsPricesPanel = ({
  product,
  truncated = false,
  onProductUpdated,
  onDirtyChange,
}: Props) => {
  const classification = useMemo(
    () => buildClassificationView(product),
    [product]
  )
  const matrix = useMemo(
    () =>
      buildVariantMatrix({
        productId: product.id,
        classification,
        options: product.options,
        variants: (product.variants ?? []).map((v) => ({
          id: v.id!,
          title: v.title,
          sku: v.sku,
          manage_inventory: v.manage_inventory,
          options: v.options,
          prices: v.prices,
        })),
        truncated,
        stockAdminPath: stockAdminProductPath,
      }),
    [product, classification, truncated]
  )

  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<VariantFilterId>("all")
  const [sort, setSort] = useState<VariantSortId>("original")
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null)
  const [skuDraft, setSkuDraft] = useState("")
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState("")
  const [priceCurrency, setPriceCurrency] = useState("rub")
  const [saving, setSaving] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkOp, setBulkOp] = useState<"set" | "add_fixed" | "add_percent">("set")
  const [bulkValue, setBulkValue] = useState("10000")
  const [bulkCurrency, setBulkCurrency] = useState("rub")
  const [bulkReport, setBulkReport] = useState<string | null>(null)

  const visible = useMemo(() => {
    const filtered = filterVariantRows(matrix.rows, { query, filter })
    return sortVariantRows(filtered, sort)
  }, [matrix.rows, query, filter, sort])

  const selectedRows = visible.filter((r) => selected[r.variant_id])

  const markDirty = (dirty: boolean) => onDirtyChange(dirty)

  const beginSkuEdit = (row: VariantMatrixRow) => {
    setEditingSkuId(row.variant_id)
    setSkuDraft(row.sku ?? "")
    markDirty(true)
  }

  const cancelSkuEdit = () => {
    setEditingSkuId(null)
    setSkuDraft("")
    if (!editingPriceId) markDirty(false)
  }

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

  const saveSku = async (row: VariantMatrixRow) => {
    setSaving(true)
    try {
      const nextSku = skuDraft.trim()
      const res = await updateAdminProductVariant(product.id, row.variant_id, {
        sku: nextSku.length ? nextSku : null,
      })
      if ("status" in res) {
        const err = normalizeAdminError({
          httpStatus: res.status,
          endpoint: `/admin/products/${product.id}/variants/${row.variant_id}`,
          body: res.body,
        })
        toast.error(formatAdminErrorPrimary(err))
        return
      }
      const fresh = await reloadAuthoritative()
      if (!fresh) {
        toast.error(
          "Изменение принято сервером, но не удалось обновить экран. Обновите страницу перед следующей правкой цены."
        )
        return
      }
      setEditingSkuId(null)
      markDirty(Boolean(editingPriceId))
      toast.success("SKU сохранён")
    } catch (e) {
      const err = normalizeAdminError({
        error: e,
        endpoint: `/admin/products/${product.id}/variants/${row.variant_id}`,
        codeHint: "network_error",
      })
      toast.error(formatAdminErrorPrimary(err))
    } finally {
      setSaving(false)
    }
  }

  const beginPriceEdit = (row: VariantMatrixRow) => {
    const currency =
      row.editable_currencies[0] ??
      row.primary_currency ??
      "rub"
    setPriceCurrency(currency)
    const existing = row.prices.find((p) => p.currency_code.toLowerCase() === currency)
    setPriceDraft(existing ? String(existing.amount) : "")
    setEditingPriceId(row.variant_id)
    markDirty(true)
  }

  const cancelPriceEdit = () => {
    setEditingPriceId(null)
    setPriceDraft("")
    if (!editingSkuId) markDirty(false)
  }

  const savePrice = async (row: VariantMatrixRow) => {
    const parsed = parseMajorPriceInput(priceDraft)
    if (!parsed.ok) {
      toast.error("Проверьте сумму: целое число ≥ 0 без копеек.")
      return
    }
    if (row.price_edit_blocked_reason) {
      toast.error(row.price_edit_blocked_reason)
      return
    }
    if (row.editable_currencies.length > 1 && !priceCurrency) {
      toast.error("Выберите валюту для изменения.")
      return
    }
    const existing = row.prices.find(
      (p) => p.currency_code.toLowerCase() === priceCurrency.toLowerCase()
    )
    const payload = buildVariantPricesPayload({
      existing: row.prices,
      currency_code: priceCurrency,
      amount: parsed.amount,
      mode: existing ? "update" : "add",
    })
    if (!payload.ok) {
      toast.error("Нельзя безопасно изменить цену. Откройте стандартную админку.")
      return
    }
    setSaving(true)
    try {
      const res = await updateAdminProductVariant(product.id, row.variant_id, {
        prices: payload.prices,
      })
      if ("status" in res) {
        const err = normalizeAdminError({
          httpStatus: res.status,
          endpoint: `/admin/products/${product.id}/variants/${row.variant_id}`,
          body: res.body,
        })
        toast.error(formatAdminErrorPrimary(err))
        return
      }
      const fresh = await reloadAuthoritative()
      if (!fresh) {
        toast.error(
          "Цена сохранена на сервере, но экран не обновился. Обновите страницу перед следующей правкой."
        )
        return
      }
      setEditingPriceId(null)
      markDirty(Boolean(editingSkuId))
      toast.success("Цена сохранена")
    } catch (e) {
      const err = normalizeAdminError({
        error: e,
        endpoint: `/admin/products/${product.id}/variants/${row.variant_id}`,
        codeHint: "network_error",
      })
      toast.error(formatAdminErrorPrimary(err))
    } finally {
      setSaving(false)
    }
  }

  const bulkPreview = useMemo(() => {
    if (bulkOp === "add_percent") {
      const percent = Number(bulkValue.replace(",", ".").replace(/\s+/g, ""))
      if (!Number.isFinite(percent)) return null
      return buildBulkPricePreview(selectedRows, {
        type: "add_percent",
        percent,
        currency_code: bulkCurrency,
      })
    }
    const parsed = parseMajorPriceInput(bulkValue, {
      allowNegative: bulkOp === "add_fixed",
    })
    if (!parsed.ok) return null
    const op: BulkPriceOp =
      bulkOp === "set"
        ? { type: "set", amount: parsed.amount, currency_code: bulkCurrency }
        : { type: "add_fixed", delta: parsed.amount, currency_code: bulkCurrency }
    return buildBulkPricePreview(selectedRows, op)
  }, [selectedRows, bulkOp, bulkValue, bulkCurrency])

  const applyBulk = async () => {
    if (!bulkPreview || bulkPreview.will_change_count === 0) return
    setSaving(true)
    const ok: string[] = []
    const failed: Array<{ id: string; reason: string }> = []
    try {
      // Fail closed: never mutate from stale matrix if authoritative hydration fails.
      const fresh = await reloadAuthoritative()
      if (!fresh) {
        setBulkReport(
          "Массовое изменение отменено: не удалось загрузить актуальные цены. Повторите позже."
        )
        toast.error("Массовое изменение отменено — нет актуальных данных")
        return
      }

      const sourceRows = buildVariantMatrix({
        productId: fresh.id,
        classification,
        options: fresh.options,
        variants: (fresh.variants ?? []).map((v) => ({
          id: v.id!,
          title: v.title,
          sku: v.sku,
          manage_inventory: v.manage_inventory,
          options: v.options,
          prices: v.prices,
        })),
        truncated,
        stockAdminPath: stockAdminProductPath,
      }).rows

      // Rebuild preview from hydrated rows so percent/fixed use current amounts.
      const selectedFresh = sourceRows.filter((r) => selected[r.variant_id])
      let livePreview = null as ReturnType<typeof buildBulkPricePreview> | null
      if (bulkOp === "add_percent") {
        const percent = Number(bulkValue.replace(",", ".").replace(/\s+/g, ""))
        if (!Number.isFinite(percent)) {
          toast.error("Некорректный процент")
          return
        }
        livePreview = buildBulkPricePreview(selectedFresh, {
          type: "add_percent",
          percent,
          currency_code: bulkCurrency,
        })
      } else {
        const parsed = parseMajorPriceInput(bulkValue, {
          allowNegative: bulkOp === "add_fixed",
        })
        if (!parsed.ok) {
          toast.error("Некорректная сумма")
          return
        }
        const op: BulkPriceOp =
          bulkOp === "set"
            ? { type: "set", amount: parsed.amount, currency_code: bulkCurrency }
            : { type: "add_fixed", delta: parsed.amount, currency_code: bulkCurrency }
        livePreview = buildBulkPricePreview(selectedFresh, op)
      }

      if (!livePreview || livePreview.will_change_count === 0) {
        setBulkReport("После обновления данных изменять нечего (все строки пропущены).")
        toast.error("Нет строк для изменения после обновления данных")
        return
      }

      for (const item of livePreview.items) {
        if (item.skipped || item.new_amount == null) continue
        const row = sourceRows.find((r) => r.variant_id === item.variant_id)
        if (!row) {
          failed.push({ id: item.variant_id, reason: "variant_missing_after_reload" })
          continue
        }
        const existing = row.prices.find(
          (p) => p.currency_code.toLowerCase() === bulkCurrency.toLowerCase()
        )
        const payload = buildVariantPricesPayload({
          existing: row.prices,
          currency_code: bulkCurrency,
          amount: item.new_amount,
          mode: existing ? "update" : "add",
        })
        if (!payload.ok) {
          failed.push({ id: item.variant_id, reason: payload.code })
          continue
        }
        try {
          const res = await updateAdminProductVariant(product.id, item.variant_id, {
            prices: payload.prices,
          })
          if ("status" in res) {
            failed.push({ id: item.variant_id, reason: `HTTP ${res.status}` })
          } else {
            ok.push(item.variant_id)
          }
        } catch (e) {
          failed.push({
            id: item.variant_id,
            reason: e instanceof Error ? e.message : "network_error",
          })
        }
      }
      const after = await reloadAuthoritative()
      if (!after) {
        setBulkReport(
          `Запись частично выполнена (успешно: ${ok.length}, ошибки: ${failed.length}), но экран не обновился. Обновите страницу.`
        )
        toast.error("Обновите страницу — кэш после массового изменения не подтверждён")
        return
      }
      setBulkReport(
        `Успешно: ${ok.length}. Не удалось: ${failed.length}${
          failed.length
            ? ` (${failed.map((f) => `${f.id}: ${f.reason}`).join("; ")})`
            : ""
        }.`
      )
      if (failed.length === 0) {
        toast.success(`Массовое изменение применено к ${ok.length} вариантам`)
        setBulkOpen(false)
      } else {
        toast.error("Часть изменений не применилась — см. отчёт")
      }
    } catch (e) {
      const err = normalizeAdminError({
        error: e,
        endpoint: `/admin/products/${product.id}/variants`,
        codeHint: "network_error",
      })
      setBulkReport(formatAdminErrorPrimary(err))
      toast.error(formatAdminErrorPrimary(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleAllVisible = (checked: boolean) => {
    const next = { ...selected }
    for (const row of visible) next[row.variant_id] = checked
    setSelected(next)
  }

  return (
    <Container className="flex flex-col gap-4 p-4">
      {matrix.banner ? (
        <Text size="small" className="rounded-md bg-ui-bg-subtle p-2">
          {matrix.banner}
        </Text>
      ) : null}
      {matrix.truncated ? (
        <Text size="small" className="text-ui-fg-subtle">
          Показаны первые загруженные варианты (лимит API). Массовые операции только по
          загруженным и выбранным строкам.
        </Text>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Text size="small" weight="plus">
            Поиск
          </Text>
          <Input
            className="mt-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск по SKU, названию и опциям"
            placeholder="SKU, опция…"
          />
        </div>
        <div>
          <Text size="small" weight="plus">
            Фильтр
          </Text>
          <select
            className="mt-1 block rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2"
            aria-label="Фильтр вариантов"
            value={filter}
            onChange={(e) => setFilter(e.target.value as VariantFilterId)}
          >
            <option value="all">Все</option>
            <option value="no_price">Без цены</option>
            <option value="no_sku">Без SKU</option>
            <option value="problems">Проблемы в данных</option>
          </select>
        </div>
        <div>
          <Text size="small" weight="plus">
            Сортировка
          </Text>
          <select
            className="mt-1 block rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2"
            aria-label="Сортировка вариантов"
            value={sort}
            onChange={(e) => setSort(e.target.value as VariantSortId)}
          >
            <option value="original">Исходный порядок</option>
            <option value="sku">SKU</option>
            <option value="price">Цена</option>
            <option value="problems">Проблемы</option>
            <option value="options">Опции</option>
          </select>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={() => {
            setQuery("")
            setFilter("all")
            setSort("original")
          }}
        >
          Сбросить
        </Button>
        <Button
          size="small"
          variant="secondary"
          disabled={selectedRows.length === 0}
          onClick={() => setBulkOpen(true)}
        >
          Массовая цена ({selectedRows.length})
        </Button>
      </div>

      <Text size="small" className="text-ui-fg-subtle">
        Показано {visible.length} из {matrix.rows.length} вариантов
        {filter !== "all" || query ? ` · фильтр: ${filter}${query ? ` / «${query}»` : ""}` : ""}
      </Text>

      {visible.length === 0 ? (
        <Text>Нет вариантов по текущему фильтру.</Text>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-ui-bg-base">
              <tr className="border-b border-ui-border-base">
                <th className="p-2">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все видимые варианты"
                    checked={visible.every((r) => selected[r.variant_id])}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                  />
                </th>
                <th className="p-2">Вариант</th>
                {matrix.columns.map((c) => (
                  <th key={c.option_id} className="p-2">
                    {c.title}
                  </th>
                ))}
                <th className="p-2">SKU</th>
                <th className="p-2">Цена</th>
                <th className="p-2">Статус цены</th>
                <th className="p-2">Полнота</th>
                <th className="p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.variant_id} className="border-b border-ui-border-base align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Выбрать вариант ${row.display_title}`}
                      checked={Boolean(selected[row.variant_id])}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [row.variant_id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Text weight="plus">{row.display_title}</Text>
                    {row.inventory_hint ? (
                      <Text size="small" className="text-ui-fg-subtle">
                        {row.inventory_hint}
                      </Text>
                    ) : null}
                  </td>
                  {matrix.columns.map((c) => (
                    <td key={c.option_id} className="p-2">
                      {row.option_values[c.option_id]}
                    </td>
                  ))}
                  <td className="p-2">
                    {editingSkuId === row.variant_id ? (
                      <div className="flex flex-col gap-1">
                        <Input
                          value={skuDraft}
                          onChange={(e) => setSkuDraft(e.target.value)}
                          aria-label={`SKU ${row.display_title}`}
                        />
                        <div className="flex gap-1">
                          <Button size="small" disabled={saving} onClick={() => saveSku(row)}>
                            Сохранить
                          </Button>
                          <Button size="small" variant="secondary" onClick={cancelSkuEdit}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Text>{row.sku || "—"}</Text>
                    )}
                  </td>
                  <td className="p-2">
                    {editingPriceId === row.variant_id ? (
                      <div className="flex flex-col gap-1">
                        {row.editable_currencies.length > 1 ? (
                          <select
                            aria-label="Валюта цены"
                            className="rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1"
                            value={priceCurrency}
                            onChange={(e) => {
                              setPriceCurrency(e.target.value)
                              const existing = row.prices.find(
                                (p) => p.currency_code.toLowerCase() === e.target.value
                              )
                              setPriceDraft(existing ? String(existing.amount) : "")
                            }}
                          >
                            {row.editable_currencies.map((c) => (
                              <option key={c} value={c}>
                                {c.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Text size="small">{priceCurrency.toUpperCase()}</Text>
                        )}
                        <Input
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          aria-label={`Цена ${row.display_title}`}
                          aria-describedby={`price-help-${row.variant_id}`}
                        />
                        <Text id={`price-help-${row.variant_id}`} size="small" className="text-ui-fg-subtle">
                          Целое число в основных единицах (например 12500 для 12 500 ₽)
                        </Text>
                        <div className="flex gap-1">
                          <Button size="small" disabled={saving} onClick={() => savePrice(row)}>
                            Сохранить
                          </Button>
                          <Button size="small" variant="secondary" onClick={cancelPriceEdit}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : row.price_status === "missing" ? (
                      <Text>—</Text>
                    ) : row.price_status === "multi" ? (
                      <div className="flex flex-col gap-0.5">
                        {row.prices.map((p) => (
                          <Text key={p.id} size="small">
                            {formatMajorMoney(p.amount, p.currency_code)}
                          </Text>
                        ))}
                      </div>
                    ) : (
                      <Text>{row.price_status_label}</Text>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge>{row.price_status_label}</Badge>
                  </td>
                  <td className="p-2">
                    {row.issues.length === 0 ? (
                      <Text size="small">Ок</Text>
                    ) : (
                      <ul className="list-disc pl-4">
                        {row.issues.map((issue) => (
                          <li key={`${issue.code}-${issue.field}`}>
                            <Text size="small">
                              {issue.level === "error"
                                ? "Ошибка"
                                : issue.level === "attention"
                                  ? "Требует внимания"
                                  : "Информация"}
                              : {issue.message} {issue.action}
                            </Text>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <Button size="small" variant="secondary" onClick={() => beginSkuEdit(row)}>
                        SKU
                      </Button>
                      {row.price_edit_blocked_reason ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          {row.price_edit_blocked_reason}
                        </Text>
                      ) : (
                        <Button size="small" variant="secondary" onClick={() => beginPriceEdit(row)}>
                          Цена
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button variant="secondary" asChild>
        <Link to={matrix.stock_admin_path}>Открыть варианты в стандартной админке</Link>
      </Button>

      {bulkOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Массовое изменение цен"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setBulkOpen(false)
          }}
        >
          <Container className="max-h-[90vh] w-full max-w-xl overflow-auto p-4">
            <Text weight="plus">Массовое изменение простых цен</Text>
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm">
                Операция
                <select
                  className="mt-1 block w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2"
                  value={bulkOp}
                  onChange={(e) => setBulkOp(e.target.value as typeof bulkOp)}
                >
                  <option value="set">Установить сумму</option>
                  <option value="add_fixed">Изменить на сумму</option>
                  <option value="add_percent">Изменить на %</option>
                </select>
              </label>
              <label className="text-sm">
                Валюта
                <Input value={bulkCurrency} onChange={(e) => setBulkCurrency(e.target.value)} />
              </label>
              <label className="text-sm">
                Значение
                <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              </label>
            </div>
            {bulkPreview ? (
              <Text size="small" className="mt-3">
                {bulkPreview.summary}
              </Text>
            ) : (
              <Text size="small" className="mt-3 text-ui-fg-subtle">
                Проверьте значение операции.
              </Text>
            )}
            {bulkReport ? (
              <Text size="small" className="mt-2">
                {bulkReport}
              </Text>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                disabled={saving || !bulkPreview || bulkPreview.will_change_count === 0}
                onClick={applyBulk}
              >
                Применить
              </Button>
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>
                Отмена
              </Button>
            </div>
          </Container>
        </div>
      ) : null}
    </Container>
  )
}
