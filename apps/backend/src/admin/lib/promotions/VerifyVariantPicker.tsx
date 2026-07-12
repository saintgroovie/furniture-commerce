import { useEffect, useState } from "react"
import { Button, Input, Text } from "@medusajs/ui"
import { searchAdminProducts } from "../woodright/dashboard-api"
import { formatAdminErrorPrimary, normalizeAdminError } from "../errors/normalize-admin-error"

export type VerifyVariantChoice = {
  variantId: string
  label: string
}

type VariantRow = {
  id: string
  title?: string | null
  sku?: string | null
  options?: Array<{ value?: string | null }> | null
}

type Props = {
  value: VerifyVariantChoice | null
  onChange: (next: VerifyVariantChoice | null) => void
  disabled?: boolean
}

function variantLabel(v: VariantRow, productTitle: string): string {
  const opts = (v.options ?? [])
    .map((o) => (o.value ?? "").trim())
    .filter(Boolean)
    .join(" / ")
  const sku = (v.sku ?? "").trim()
  const parts = [productTitle]
  if (opts) parts.push(opts)
  else if ((v.title ?? "").trim()) parts.push((v.title ?? "").trim())
  if (sku) parts.push(`арт. ${sku}`)
  return parts.join(" · ")
}

/**
 * Loop 3 — pick a cart-test variant via product search + human-readable options.
 * Never asks the operator to paste variant_… IDs.
 */
export function VerifyVariantPicker({ value, onChange, disabled }: Props) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Array<{ id: string; title: string }>>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [productTitle, setProductTitle] = useState("")
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [variantsError, setVariantsError] = useState<string | null>(null)
  const [loadingVariants, setLoadingVariants] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      setSearchError(null)
      return
    }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      try {
        const res = await searchAdminProducts(
          { q, limit: 8, offset: 0 },
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        if ("status" in res) {
          setSearchError(
            formatAdminErrorPrimary(
              normalizeAdminError({
                httpStatus: res.status,
                endpoint: "/admin/products",
                body: res.body,
              })
            )
          )
          setHits([])
          return
        }
        setHits(
          res.products.map((p) => ({
            id: p.id,
            title: (p.title ?? "").trim() || "Без названия",
          }))
        )
      } catch (e) {
        if (!ac.signal.aborted) {
          setSearchError(
            formatAdminErrorPrimary(
              normalizeAdminError({ error: e, codeHint: "network_error" })
            )
          )
        }
      } finally {
        if (!ac.signal.aborted) setSearching(false)
      }
    }, 350)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [q])

  useEffect(() => {
    if (!productId) {
      setVariants([])
      return
    }
    const ac = new AbortController()
    setLoadingVariants(true)
    setVariantsError(null)
    ;(async () => {
      try {
        const fields = [
          "id",
          "title",
          "variants.id",
          "variants.title",
          "variants.sku",
          "variants.options.value",
        ].join(",")
        const res = await fetch(
          `/admin/products/${productId}?fields=${encodeURIComponent(fields)}`,
          { credentials: "include", signal: ac.signal, headers: { Accept: "application/json" } }
        )
        const body = await res.json().catch(() => ({}))
        if (ac.signal.aborted) return
        if (!res.ok) {
          setVariantsError(
            formatAdminErrorPrimary(
              normalizeAdminError({
                httpStatus: res.status,
                endpoint: `/admin/products/${productId}`,
                body,
              })
            )
          )
          setVariants([])
          return
        }
        const product = (body as { product?: { title?: string; variants?: VariantRow[] } })
          .product
        setProductTitle((product?.title ?? "").trim() || "Без названия")
        setVariants(product?.variants ?? [])
      } catch (e) {
        if (!ac.signal.aborted) {
          setVariantsError(
            formatAdminErrorPrimary(
              normalizeAdminError({ error: e, codeHint: "network_error" })
            )
          )
        }
      } finally {
        if (!ac.signal.aborted) setLoadingVariants(false)
      }
    })()
    return () => ac.abort()
  }, [productId])

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base p-2">
          <Text size="small">{value.label}</Text>
          <Button
            size="small"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              setProductId(null)
              setQ("")
              setHits([])
            }}
          >
            Сменить
          </Button>
        </div>
      ) : (
        <>
          <Input
            value={q}
            disabled={disabled}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти товар по названию или артикулу"
            aria-label="Поиск товара для проверки акции"
          />
          {searching ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              Ищем…
            </Text>
          ) : null}
          {searchError ? (
            <Text size="xsmall" className="text-ui-fg-error">
              {searchError}
            </Text>
          ) : null}
          {hits.length ? (
            <div className="flex max-h-40 flex-col overflow-auto rounded-md border border-ui-border-base">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={disabled}
                  className="px-2 py-1.5 text-left hover:bg-ui-bg-subtle"
                  onClick={() => {
                    setProductId(h.id)
                    setProductTitle(h.title)
                    setHits([])
                    setQ("")
                  }}
                >
                  <Text size="small">{h.title}</Text>
                </button>
              ))}
            </div>
          ) : null}

          {productId ? (
            <div className="rounded-md border border-ui-border-base p-2">
              <Text size="small" weight="plus">
                Вариант: {productTitle}
              </Text>
              {loadingVariants ? (
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Загружаем варианты…
                </Text>
              ) : null}
              {variantsError ? (
                <Text size="xsmall" className="mt-1 text-ui-fg-error">
                  {variantsError}
                </Text>
              ) : null}
              {!loadingVariants && !variants.length && !variantsError ? (
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  У товара нет вариантов
                </Text>
              ) : null}
              <div className="mt-1 flex flex-col">
                {variants.map((v) => {
                  if (!v.id) return null
                  const label = variantLabel(v, productTitle)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={disabled}
                      className="rounded px-2 py-1 text-left hover:bg-ui-bg-subtle"
                      onClick={() => onChange({ variantId: v.id, label })}
                    >
                      <Text size="small">{label}</Text>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
