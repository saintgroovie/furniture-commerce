import { Button, Input, Label, Prompt, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { adminJson, sellerErrorMessage } from "../../lib/admin-fetch"
import { assessPriceSave, formatRubAmount, parseSellerPriceInput } from "../../../lib/woodright-admin/price-sanity"
import type { SellerVariant } from "../../../lib/woodright-admin/seller-product-types"

type Props = {
  productId: string
  variants: SellerVariant[]
  hasMaterialTiers: boolean
  onSaved: () => Promise<void> | void
}

type DraftState = {
  input: string
  error: string | null
  note: string | null
  pendingConfirm: number | null
  saving: boolean
}

function emptyDraft(amount: number | null): DraftState {
  return {
    input: amount != null ? String(amount) : "",
    error: null,
    note: null,
    pendingConfirm: null,
    saving: false,
  }
}

export function PriceSection({ productId, variants, hasMaterialTiers, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() => {
    const next: Record<string, DraftState> = {}
    for (const variant of variants) {
      next[variant.id] = emptyDraft(variant.rub_price?.amount ?? null)
    }
    return next
  })

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, DraftState> = {}
      for (const variant of variants) {
        const existing = prev[variant.id]
        next[variant.id] = existing?.saving
          ? existing
          : emptyDraft(variant.rub_price?.amount ?? null)
      }
      return next
    })
  }, [variants])

  const rows = useMemo(() => variants, [variants])
  const single = rows.length <= 1

  const updateDraft = (variantId: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [variantId]: { ...emptyDraft(null), ...prev[variantId], ...patch },
    }))
  }

  const saveVariant = async (variant: SellerVariant, amount: number) => {
    updateDraft(variant.id, { saving: true, error: null, pendingConfirm: null })
    const existingId = variant.rub_price?.id
    const prices = existingId
      ? [{ id: existingId, amount, currency_code: "rub" }]
      : [{ amount, currency_code: "rub" }]
    try {
      await adminJson(`/admin/products/${productId}/variants/${variant.id}`, {
        method: "POST",
        body: JSON.stringify({ prices }),
      })
      await onSaved()
      updateDraft(variant.id, { saving: false, input: String(amount), error: null })
    } catch (error) {
      updateDraft(variant.id, {
        saving: false,
        error: sellerErrorMessage(error, "Не удалось сохранить цену"),
      })
    }
  }

  const requestSave = (variant: SellerVariant) => {
    const draft = drafts[variant.id] ?? emptyDraft(variant.rub_price?.amount ?? null)
    const parsed = parseSellerPriceInput(draft.input)
    if (!parsed.ok) {
      updateDraft(variant.id, { error: parsed.message, pendingConfirm: null })
      return
    }
    const assessment = assessPriceSave(parsed.amount, variant.rub_price?.amount ?? null)
    if (assessment.decision === "reject") {
      updateDraft(variant.id, { error: assessment.message, pendingConfirm: null })
      return
    }
    if (assessment.decision === "confirm") {
      updateDraft(variant.id, { error: null, pendingConfirm: assessment.amount })
      return
    }
    if (assessment.decision === "save") {
      updateDraft(variant.id, {
        error: null,
        note: assessment.range_warning ?? null,
        pendingConfirm: null,
      })
      void saveVariant(variant, assessment.amount)
      return
    }
  }

  return (
    <section className="px-6 py-4">
      <Text weight="plus" className="mb-1">
        Цена
      </Text>
      <Text size="small" className="text-ui-fg-subtle mb-4">
        Эта цена показывается покупателям на сайте
      </Text>
      {hasMaterialTiers && (
        <Text size="small" className="text-ui-fg-subtle mb-4">
          Это базовая цена исполнения «Полностью из массива». Цены других исполнений рассчитываются автоматически
        </Text>
      )}
      <div className="flex flex-col gap-4">
        {rows.map((variant) => {
          const draft = drafts[variant.id] ?? emptyDraft(variant.rub_price?.amount ?? null)
          const current = variant.rub_price?.amount
          const fieldId = `price-${variant.id}`
          const label = single
            ? "Новая цена"
            : [variant.title, variant.sku].filter(Boolean).join(" · ") || "Вариант"
          return (
            <div key={variant.id} className="flex flex-col gap-2">
              {!single && (
                <Text size="small" weight="plus">
                  {label}
                </Text>
              )}
              {current != null && (
                <Text size="small" className="text-ui-fg-subtle">
                  Текущая цена {formatRubAmount(current)}
                </Text>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[12rem] flex-col gap-1">
                  <Label htmlFor={fieldId}>{single ? "Новая цена" : "Цена"}</Label>
                  <Input
                    id={fieldId}
                    inputMode="numeric"
                    value={draft.input}
                    aria-invalid={Boolean(draft.error)}
                    aria-describedby={draft.error ? `${fieldId}-error` : undefined}
                    onChange={(event) =>
                      updateDraft(variant.id, { input: event.target.value, error: null })
                    }
                  />
                </div>
                <Text size="small" className="pb-2">
                  ₽
                </Text>
                <Button
                  size="small"
                  disabled={draft.saving}
                  onClick={() => requestSave(variant)}
                >
                  {draft.saving ? "Сохраняем…" : "Сохранить цену"}
                </Button>
              </div>
              {draft.error && (
                <Text id={`${fieldId}-error`} size="small" className="text-ui-fg-error">
                  {draft.error}
                </Text>
              )}
              {draft.note && !draft.error && (
                <Text size="small" className="text-ui-fg-subtle">
                  {draft.note}
                </Text>
              )}
              <Prompt
                open={draft.pendingConfirm != null}
                onOpenChange={(open) => {
                  if (!open) updateDraft(variant.id, { pendingConfirm: null })
                }}
              >
                <Prompt.Content>
                  <Prompt.Header>
                    <Prompt.Title>Цена сильно отличается от текущей</Prompt.Title>
                    <Prompt.Description>
                      {current != null && draft.pendingConfirm != null ? (
                        <>
                          <span className="block">Было: {formatRubAmount(current)}</span>
                          <span className="block">Стало: {formatRubAmount(draft.pendingConfirm)}</span>
                          <span className="mt-2 block">Проверьте сумму перед сохранением</span>
                        </>
                      ) : (
                        "Проверьте сумму перед сохранением"
                      )}
                    </Prompt.Description>
                  </Prompt.Header>
                  <Prompt.Footer>
                    <Prompt.Cancel>Отмена</Prompt.Cancel>
                    <Prompt.Action
                      onClick={() => {
                        if (draft.pendingConfirm != null) {
                          void saveVariant(variant, draft.pendingConfirm)
                        }
                      }}
                    >
                      Сохранить
                    </Prompt.Action>
                  </Prompt.Footer>
                </Prompt.Content>
              </Prompt>
            </div>
          )
        })}
        {rows.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            У товара нет вариантов с ценой
          </Text>
        )}
      </div>
    </section>
  )
}
