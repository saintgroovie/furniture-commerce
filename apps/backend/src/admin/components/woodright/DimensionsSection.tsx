import { Button, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { adminJson, sellerErrorMessage } from "../../lib/admin-fetch"
import { useRegisterDirty } from "../../lib/use-dirty-guard"
import { mmToSellerCm, cmToMm } from "../../../lib/woodright-admin/dimensions-command"
import type { SellerDimensionsMm } from "../../../lib/woodright-admin/seller-product-types"

type Props = {
  productId: string
  dimensions: SellerDimensionsMm
  onSaved: () => Promise<void> | void
}

type Axis = "height" | "width" | "depth"

const AXIS_FIELDS: Array<{ axis: Axis; label: string; fieldId: string }> = [
  { axis: "height", label: "Высота", fieldId: "dim-height" },
  { axis: "width", label: "Ширина", fieldId: "dim-width" },
  { axis: "depth", label: "Глубина", fieldId: "dim-depth" },
]

function toForm(dimensions: SellerDimensionsMm): Record<Axis, string> {
  return {
    height: mmToSellerCm(dimensions.height_mm),
    width: mmToSellerCm(dimensions.width_mm),
    depth: mmToSellerCm(dimensions.depth_mm),
  }
}

function parseField(raw: string): number | null | { error: string } {
  const trimmed = raw.trim().replace(",", ".")
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { error: "Укажите размер числом или оставьте поле пустым" }
  if (value === 0) return { error: "Укажите размер или оставьте поле пустым" }
  if (value < 0) return { error: "Размер не может быть отрицательным" }
  const tenths = value * 10
  if (Math.abs(tenths - Math.round(tenths)) > 1e-9) {
    return { error: "Укажите размер с точностью до 0,1 см" }
  }
  return value
}

export function DimensionsSection({ productId, dimensions, onSaved }: Props) {
  const [form, setForm] = useState(() => toForm(dimensions))
  const [error, setError] = useState<string | null>(null)
  const [errorAxis, setErrorAxis] = useState<Axis | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saved = toForm(dimensions)
  const dirty =
    form.height !== saved.height || form.width !== saved.width || form.depth !== saved.depth
  useRegisterDirty("dimensions", dirty)

  useEffect(() => {
    if (dirty) return
    setForm(toForm(dimensions))
  }, [dimensions.height_mm, dimensions.width_mm, dimensions.depth_mm, dirty])

  const save = async () => {
    const parsed: Record<Axis, number | null> = { height: null, width: null, depth: null }
    for (const { axis } of AXIS_FIELDS) {
      const value = parseField(form[axis])
      if (value && typeof value === "object" && "error" in value) {
        setError(value.error)
        setErrorAxis(axis)
        return
      }
      parsed[axis] = value
    }
    setSaving(true)
    setError(null)
    setErrorAxis(null)
    setNote(null)
    try {
      await adminJson(`/admin/woodright/products/${productId}/dimensions`, {
        method: "POST",
        body: JSON.stringify({
          height_cm: parsed.height,
          width_cm: parsed.width,
          depth_cm: parsed.depth,
        }),
      })
      setForm({
        height: parsed.height == null ? "" : mmToSellerCm(cmToMm(parsed.height)),
        width: parsed.width == null ? "" : mmToSellerCm(cmToMm(parsed.width)),
        depth: parsed.depth == null ? "" : mmToSellerCm(cmToMm(parsed.depth)),
      })
      await onSaved()
      setNote("Сохранено")
      window.setTimeout(() => setNote(null), 5000)
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить размеры"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="px-6 py-4" id="woodright-dimensions">
      <Text weight="plus" className="mb-1">
        Размеры
      </Text>
      <Text size="small" className="text-ui-fg-subtle mb-4">
        Оставьте пустым, если размер неизвестен
      </Text>
      <div className="flex flex-wrap gap-4">
        {AXIS_FIELDS.map(({ axis, label, fieldId }) => (
          <div key={axis} className="flex min-w-[8rem] flex-col gap-1">
            <Label htmlFor={fieldId}>{label}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={fieldId}
                inputMode="decimal"
                value={form[axis]}
                aria-invalid={errorAxis === axis}
                onChange={(event) => {
                  setError(null)
                  setErrorAxis(null)
                  setForm((prev) => ({ ...prev, [axis]: event.target.value }))
                }}
              />
              <Text size="small">см</Text>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <Text size="small" className="text-ui-fg-error mt-2">
          {error}
        </Text>
      )}
      {note && !error && (
        <Text size="small" className="text-ui-fg-subtle mt-2">
          {note}
        </Text>
      )}
      <div className="mt-4">
        <Button size="small" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить размеры"}
        </Button>
      </div>
    </section>
  )
}
