import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react"
import {
  buildAdminProductProjection,
  type AdminProductProjection,
} from "../../lib/catalog-admin/admin-product-projection"
import { formatAxisGlance } from "../../lib/catalog-admin/buyer-options-summary"
import {
  IMPORT_PROVENANCE_EXPLANATION,
  IMPORT_PROVENANCE_SECTION_TITLE,
} from "../../lib/catalog-admin/import-provenance"
import { adminJson } from "../lib/admin-fetch"

type ProductData = {
  id?: string
  title?: string
  handle?: string
  status?: string
  thumbnail?: string
  metadata?: Record<string, unknown>
  options?: Array<{ title?: string; values?: Array<{ value?: string }> }>
  images?: Array<{ url?: string }>
  variants?: Array<{
    id?: string
    title?: string
    sku?: string
    prices?: Array<{ amount?: number; currency_code?: string }>
    metadata?: Record<string, unknown> | null
  }>
}

const box: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 16,
  background: "var(--bg-base, #fff)",
  borderRadius: 8,
  border: "1px solid var(--border-base, #e5e5e5)",
}

const muted: CSSProperties = { color: "var(--fg-muted, #666)", fontSize: 12 }
const sectionTitle: CSSProperties = { fontWeight: 600, marginTop: 4 }
const warn: CSSProperties = {
  ...muted,
  color: "var(--fg-error, #9a3412)",
  background: "var(--bg-subtle, #fff7ed)",
  padding: "8px 10px",
  borderRadius: 6,
}

const DQ_COLORS: Record<string, string> = {
  ok: "#166534",
  needs_source: "#9a3412",
  conflict: "#9a3412",
  pending_confirmation: "#854d0e",
  content_improvement: "#1e40af",
  malformed: "#9a3412",
}

/**
 * Operational Woodright summary for managers: buyer truth first.
 * Isolated failure: native product page stays usable if this widget errors.
 */
const CatalogBuyerPreviewWidget = ({ data }: { data?: ProductData }) => {
  const [classification, setClassification] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  /** Saved titles keyed by product id — never leak across navigation. */
  const [savedTitlesById, setSavedTitlesById] = useState<Record<string, string>>(
    {}
  )
  const [metaFingerprint, setMetaFingerprint] = useState<string | null>(null)
  /** Hydrated from buyer-identity — widget props often omit variants/SKU. */
  const [serverProjection, setServerProjection] =
    useState<AdminProductProjection | null>(null)

  const productId = data?.id ?? ""

  const clientProjection = useMemo(() => {
    try {
      return buildAdminProductProjection({
        ...data,
        classification,
      })
    } catch {
      return null
    }
  }, [data, classification])

  const projection = serverProjection ?? clientProjection

  useEffect(() => {
    setSaveMsg(null)
    setSaveErr(null)
    setTechOpen(false)
    setImportOpen(false)
    setClassification(null)
    setMetaFingerprint(null)
    setServerProjection(null)
  }, [productId])

  useEffect(() => {
    if (!projection?.public_title || !productId) return
    const saved = savedTitlesById[productId]
    setTitleDraft(saved ?? projection.public_title)
  }, [productId, projection?.public_title, savedTitlesById])

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await adminJson<{
          projection?: AdminProductProjection
          metadata_fingerprint?: string
        }>(`/admin/woodright/products/${productId}/buyer-identity`)
        if (cancelled) return
        if (res.projection) setServerProjection(res.projection)
        setClassification(res.projection?.classification ?? null)
        if (typeof res.metadata_fingerprint === "string") {
          setMetaFingerprint(res.metadata_fingerprint)
        }
      } catch {
        if (!cancelled) setClassification(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productId])

  const onSaveTitle = useCallback(async () => {
    if (!productId) return
    setSaving(true)
    setSaveErr(null)
    setSaveMsg(null)
    try {
      const res = await adminJson<{
        public_title: string
        public_title_source: string
        metadata_fingerprint?: string
        projection?: AdminProductProjection
      }>(`/admin/woodright/products/${productId}/buyer-identity`, {
        method: "PUT",
        body: JSON.stringify({
          public_title: titleDraft,
          metadata_fingerprint: metaFingerprint,
        }),
      })
      setSavedTitlesById((prev) => ({
        ...prev,
        [productId]: res.public_title,
      }))
      if (typeof res.metadata_fingerprint === "string") {
        setMetaFingerprint(res.metadata_fingerprint)
      }
      if (res.projection) setServerProjection(res.projection)
      setSaveMsg(`Сохранено · на сайте: ${res.public_title}`)
    } catch (e) {
      const err = e as Error
      setSaveErr(err.message || "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [productId, titleDraft, metaFingerprint])

  if (!data?.id) return null

  if (!projection) {
    return (
      <div style={box}>
        <div style={sectionTitle}>Woodright · на сайте</div>
        <div style={warn}>
          Не удалось построить buyer-preview. Нативная карточка Medusa доступна ниже
        </div>
      </div>
    )
  }

  const dqColor = DQ_COLORS[projection.data_quality.kind] ?? "#666"
  const statusRu =
    projection.status === "published"
      ? "Опубликовано"
      : projection.status === "draft"
        ? "Черновик"
        : projection.status ?? "—"

  return (
    <div style={box}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15 }}>Woodright · на сайте</div>
        <div style={{ ...muted, color: dqColor, fontWeight: 600 }}>
          Данные: {projection.data_quality.label_ru}
        </div>
      </div>

      <div style={muted}>
        {statusRu}
        {projection.sku ? ` · SKU ${projection.sku}` : ""}
        {projection.classification ? ` · ${projection.classification}` : ""}
        {projection.collection_hint
          ? ` · ${projection.collection_hint}`
          : ""}
      </div>

      <div style={sectionTitle}>Название на сайте</div>
      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        style={{
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid var(--border-base, #d4d4d4)",
          fontSize: 14,
        }}
        aria-label="Название на сайте"
      />
      <div style={muted}>
        каталожный resolver · витрина может транскрибировать EN-модель
        {` · источник: ${projection.public_title_source}`}
        {projection.technical_title &&
        projection.technical_title !== projection.public_title
          ? ` · техническое Medusa: ${projection.technical_title}`
          : ""}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={
            saving ||
            !metaFingerprint ||
            titleDraft.trim() === projection.public_title
          }
          onClick={() => void onSaveTitle()}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--border-base, #d4d4d4)",
            background: "var(--bg-field, #fafafa)",
            cursor: saving ? "wait" : "pointer",
            fontSize: 13,
          }}
        >
          {saving ? "Сохраняю…" : "Сохранить название"}
        </button>
        {saveMsg ? <span style={{ ...muted, color: "#166534" }}>{saveMsg}</span> : null}
        {saveErr ? <span style={{ ...muted, color: "#9a3412" }}>{saveErr}</span> : null}
      </div>

      <div style={sectionTitle}>Покупательские опции</div>
      {projection.buyer_axes.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {projection.buyer_axes.map((a) => (
            <li key={a.key}>
              <strong>{a.label_ru}</strong>: {formatAxisGlance(a)}
            </li>
          ))}
        </ul>
      ) : projection.native_option_fallback.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {projection.native_option_fallback.map((o) => (
            <li key={o.title}>
              {o.title}: {o.values.join(" · ")}
            </li>
          ))}
        </ul>
      ) : (
        <div style={muted}>
          Нет отдельных покупательских опций (технический Default скрыт)
        </div>
      )}
      <div style={muted}>
        Это не native Medusa variants · technical variants:{" "}
        {projection.technical_variant_count}
        {projection.technical_default_hidden ? " · Default скрыт из buyer view" : ""}
      </div>

      <div style={sectionTitle}>Цена</div>
      <div>{projection.price.medusa_base_label ?? "не загружена в виджет"}</div>
      <div style={muted}>{projection.price.semantics_ru}</div>

      <div style={sectionTitle}>Габариты (В → Ш → Г)</div>
      <div>
        {projection.dimensions.display_lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div style={muted}>{projection.dimensions.trust_label_ru}</div>
      {projection.dimensions.block_casual_edit ? (
        <div style={warn}>{projection.dimensions.manager_hint_ru}</div>
      ) : null}

      <div style={sectionTitle}>Медиа</div>
      <div style={muted}>
        {projection.media.image_count
          ? `Изображений: ${projection.media.image_count}`
          : "Изображений нет"}
        {" · "}
        swatch только из подтверждённых execution-полей (hero не образец)
      </div>

      {projection.data_quality.warnings.length > 0 ? (
        <>
          <div style={sectionTitle}>Предупреждения</div>
          {projection.data_quality.warnings.map((w) => (
            <div key={w} style={warn}>
              {w}
            </div>
          ))}
        </>
      ) : null}

      {projection.import_provenance ? (
        <>
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            style={{
              ...muted,
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            {importOpen ? "▾" : "▸"} {IMPORT_PROVENANCE_SECTION_TITLE}
          </button>
          {importOpen ? (
            <div style={muted}>
              <div>{IMPORT_PROVENANCE_EXPLANATION}</div>
              {projection.import_provenance.rows.map((row) => (
                <div key={row.key}>
                  {row.label_ru}: {row.value}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setTechOpen((v) => !v)}
        style={{
          ...muted,
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        {techOpen ? "▾" : "▸"} Технические данные
      </button>
      {techOpen ? (
        <div style={muted}>
          <div>product id: {projection.product_id}</div>
          <div>handle: {projection.handle ?? "—"}</div>
          <div>
            legacy_cs_cart_product_id:{" "}
            {projection.legacy_cs_cart_product_id ?? "—"} (поле с исключениями - не
            «verified identity»)
          </div>
          {projection.legacy_title ? (
            <div>legacy/canonical: {projection.legacy_title}</div>
          ) : null}
          {projection.dimensions.technical_note ? (
            <div>{projection.dimensions.technical_note}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default CatalogBuyerPreviewWidget
