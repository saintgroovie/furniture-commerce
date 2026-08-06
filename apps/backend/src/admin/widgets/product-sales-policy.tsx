import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react"
import { adminJson } from "../lib/admin-fetch"

type SalesMode =
  | "in_stock"
  | "made_to_order"
  | "configurable_to_order"
  | "quote_required"
  | "bespoke_project"
  | "showroom_sample"
  | "unavailable"

type SalesModifier =
  | "preorder"
  | "only_as_set"
  | "showroom_only"
  | "limited_series"
  | "discontinued"
  | "manager_confirmation_required"

const MODE_LABELS: Record<SalesMode, string> = {
  in_stock: "В наличии",
  made_to_order: "Изготавливается на заказ",
  configurable_to_order: "Изготавливается в выбранной конфигурации",
  quote_required: "Цена и срок по запросу",
  bespoke_project: "Индивидуальный проект",
  showroom_sample: "Выставочный образец",
  unavailable: "Недоступен для заказа",
}

const MODIFIER_LABELS: Record<SalesModifier, string> = {
  preorder: "Предзаказ",
  only_as_set: "Только в комплекте",
  showroom_only: "Только в шоуруме",
  limited_series: "Ограниченная серия",
  discontinued: "Снят с производства",
  manager_confirmation_required: "Нужно подтверждение менеджера",
}

const ALL_MODES = Object.keys(MODE_LABELS) as SalesMode[]
const ALL_MODIFIERS = Object.keys(MODIFIER_LABELS) as SalesModifier[]

type PurchasePreview = {
  cta_label?: string
  availability_label?: string
  can_purchase?: boolean
  purchase_flow?: string
  buyer_message?: string | null
}

type PolicyResponse = {
  sales_policy: {
    id?: string
    sales_mode?: SalesMode
    modifiers?: SalesModifier[]
    lead_time_text?: string | null
    buyer_message?: string | null
    manager_confirmation_required?: boolean
    related_room_set_id?: string | null
    showroom_sample_available?: boolean
    unavailable_reason?: string | null
  } | null
  purchase?: PurchasePreview
}

const ProductSalesPolicyWidget = ({
  data,
}: {
  data?: { id?: string }
}) => {
  const productId = data?.id ?? ""
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [salesMode, setSalesMode] = useState<SalesMode>("made_to_order")
  const [modifiers, setModifiers] = useState<SalesModifier[]>([])
  const [leadTime, setLeadTime] = useState("")
  const [buyerMessage, setBuyerMessage] = useState("")
  const [managerRequired, setManagerRequired] = useState(false)
  const [relatedSetId, setRelatedSetId] = useState("")
  const [showroomSample, setShowroomSample] = useState(false)
  const [unavailableReason, setUnavailableReason] = useState("")
  const [preview, setPreview] = useState<PurchasePreview | null>(null)
  const [hasPolicy, setHasPolicy] = useState(false)

  const load = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    setError(null)
    try {
      const res = await adminJson<PolicyResponse>(
        `/admin/woodright/products/${productId}/sales-policy`
      )
      const p = res.sales_policy
      setHasPolicy(Boolean(p?.id))
      if (p?.sales_mode) setSalesMode(p.sales_mode)
      setModifiers((p?.modifiers as SalesModifier[]) ?? [])
      setLeadTime(p?.lead_time_text ?? "")
      setBuyerMessage(p?.buyer_message ?? "")
      setManagerRequired(Boolean(p?.manager_confirmation_required))
      setRelatedSetId(p?.related_room_set_id ?? "")
      setShowroomSample(Boolean(p?.showroom_sample_available))
      setUnavailableReason(p?.unavailable_reason ?? "")
      setPreview(res.purchase ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить")
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleModifier = (m: SalesModifier) => {
    setModifiers((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    )
  }

  const save = async () => {
    if (!productId) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminJson<PolicyResponse>(
        `/admin/woodright/products/${productId}/sales-policy`,
        {
          method: "PUT",
          body: JSON.stringify({
            sales_mode: salesMode,
            modifiers,
            lead_time_text: leadTime || null,
            buyer_message: buyerMessage || null,
            manager_confirmation_required: managerRequired,
            related_room_set_id: relatedSetId || null,
            showroom_sample_available: showroomSample,
            unavailable_reason: unavailableReason || null,
          }),
        }
      )
      setHasPolicy(Boolean(res.sales_policy?.id))
      setPreview(res.purchase ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const resetOverride = async () => {
    if (!productId) return
    setSaving(true)
    setError(null)
    try {
      await adminJson(`/admin/woodright/products/${productId}/sales-policy`, {
        method: "DELETE",
      })
      setHasPolicy(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сбросить")
    } finally {
      setSaving(false)
    }
  }

  const onlyAsSet = useMemo(
    () => modifiers.includes("only_as_set"),
    [modifiers]
  )

  if (!productId) {
    return (
      <div style={box}>
        <h2 style={title}>Как продаётся товар</h2>
        <p style={muted}>Нет id товара</p>
      </div>
    )
  }

  return (
    <div style={box}>
      <h2 style={title}>Как продаётся товар</h2>
      {loading ? (
        <p style={muted}>Загрузка…</p>
      ) : (
        <>
          <label style={label}>
            Основной режим продажи
            <select
              value={salesMode}
              onChange={(e) => setSalesMode(e.target.value as SalesMode)}
              style={input}
            >
              {ALL_MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: "none", padding: 0, margin: "0.75rem 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>
              Дополнительные признаки
            </legend>
            {ALL_MODIFIERS.map((m) => (
              <label key={m} style={{ display: "block", marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={modifiers.includes(m)}
                  onChange={() => toggleModifier(m)}
                />{" "}
                {MODIFIER_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <label style={label}>
            Ориентировочный срок изготовления
            <input
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              style={input}
              placeholder="например, 4-6 недель"
            />
          </label>

          <label style={label}>
            Текст для покупателя
            <textarea
              value={buyerMessage}
              onChange={(e) => setBuyerMessage(e.target.value)}
              style={{ ...input, minHeight: 64 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={managerRequired}
              onChange={(e) => setManagerRequired(e.target.checked)}
            />{" "}
            Требуется подтверждение менеджера
          </label>

          {onlyAsSet && (
            <label style={label}>
              Связанный комплект (id)
              <input
                value={relatedSetId}
                onChange={(e) => setRelatedSetId(e.target.value)}
                style={input}
              />
            </label>
          )}

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={showroomSample}
              onChange={(e) => setShowroomSample(e.target.checked)}
            />{" "}
            Доступность выставочного образца
          </label>

          {salesMode === "unavailable" && (
            <label style={label}>
              Причина недоступности
              <input
                value={unavailableReason}
                onChange={(e) => setUnavailableReason(e.target.value)}
                style={input}
              />
            </label>
          )}

          {preview && (
            <div style={previewBox}>
              <div style={{ fontWeight: 600 }}>Превью для покупателя</div>
              <div>{preview.availability_label}</div>
              <div>CTA: {preview.cta_label}</div>
              <div>
                В корзину:{" "}
                {preview.can_purchase && preview.purchase_flow === "cart"
                  ? "да"
                  : "нет"}
              </div>
            </div>
          )}

          {error && <p style={{ color: "#b42318" }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
            {hasPolicy && (
              <button
                type="button"
                onClick={() => void resetOverride()}
                disabled={saving}
              >
                Сбросить override
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const box: CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
}
const title: CSSProperties = { margin: "0 0 12px", fontSize: 16 }
const label: CSSProperties = {
  display: "block",
  marginBottom: 10,
  fontSize: 13,
}
const input: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  boxSizing: "border-box",
}
const muted: CSSProperties = { color: "#667085", fontSize: 13 }
const previewBox: CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: "#f8fafc",
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.45,
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductSalesPolicyWidget
