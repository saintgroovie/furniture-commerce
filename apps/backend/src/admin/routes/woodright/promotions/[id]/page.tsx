import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { readWoodrightAdminUxFlagFromBrowser } from "../../../../lib/woodright/browser-flag"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../../../../lib/errors/normalize-admin-error"
import { buildAdminErrorViewModel } from "../../../../components/woodright/admin-error-view-model"
import {
  fetchAdminPromotion,
  stockAdminPromotionPath,
  stockAdminPromotionsPath,
  updateAdminPromotion,
} from "../../../../lib/promotions/api"
import { buildPromotionStatusVM } from "../../../../lib/promotions/status"
import { buildPromotionSummary } from "../../../../lib/promotions/summary"
import { buildImpactEstimate } from "../../../../lib/promotions/impact"
import { describeRule } from "../../../../lib/promotions/rules"
import { describeCampaign } from "../../../../lib/promotions/campaign"
import {
  buildPromotionFingerprint,
  checkPromotionStale,
} from "../../../../lib/promotions/fingerprint"
import { parseFixedAmountInput, parsePercentInput, AMOUNT_ERROR_COPY } from "../../../../lib/promotions/amount"
import {
  addStoreCartLineItem,
  applyStoreCartPromoCodes,
  createStoreCart,
  resolvePublishableKey,
} from "../../../../lib/promotions/store-cart-api"
import {
  VerifyVariantPicker,
  type VerifyVariantChoice,
} from "../../../../lib/promotions/VerifyVariantPicker"
import { attributeCartAdjustments } from "../../../../lib/promotions/cart-result"
import {
  summarizeOperationSteps,
  type OperationStepResult,
} from "../../../../lib/promotions/partial-failure"
import type { AdminPromotionDto } from "../../../../lib/promotions/types"

type VerifyState = {
  running: boolean
  lines: string[]
  verdict: string | null
  honest_note: string | null
}

const PromotionDetailPage = () => {
  const { id = "" } = useParams()
  const flagOn = readWoodrightAdminUxFlagFromBrowser()
  const [loading, setLoading] = useState(true)
  const [promotion, setPromotion] = useState<AdminPromotionDto | null>(null)
  const [fingerprint, setFingerprint] = useState<string>("")
  const [loadError, setLoadError] = useState<ReturnType<typeof normalizeAdminError> | null>(
    null
  )
  const [statusBusy, setStatusBusy] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyVariant, setVerifyVariant] = useState<VerifyVariantChoice | null>(null)
  const [verify, setVerify] = useState<VerifyState>({
    running: false,
    lines: [],
    verdict: null,
    honest_note: null,
  })

  const load = async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetchAdminPromotion(id, signal ? { signal } : undefined)
      if (signal?.aborted) return
      if ("status" in res) {
        setLoadError(
          normalizeAdminError({
            httpStatus: res.status,
            endpoint: `/admin/promotions/${id}`,
            body: res.body,
            codeHint: res.status === 404 ? "deleted_entity" : undefined,
          })
        )
        setPromotion(null)
        return
      }
      setPromotion(res.promotion)
      setFingerprint(buildPromotionFingerprint(res.promotion))
    } catch (e) {
      if (signal?.aborted) return
      setLoadError(
        normalizeAdminError({
          error: e,
          endpoint: `/admin/promotions/${id}`,
          codeHint: "network_error",
        })
      )
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    if (!flagOn || !id) return
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagOn, id])

  const status = useMemo(
    () => (promotion ? buildPromotionStatusVM({ promotion }) : null),
    [promotion]
  )
  const summary = useMemo(
    () => (promotion ? buildPromotionSummary(promotion) : null),
    [promotion]
  )
  const impact = useMemo(
    () => (promotion ? buildImpactEstimate(promotion) : null),
    [promotion]
  )

  const targetDescriptions = useMemo(() => {
    const rules = promotion?.application_method?.target_rules ?? []
    return rules.map((r) => describeRule(r, "target-rules"))
  }, [promotion])
  const conditionDescriptions = useMemo(() => {
    const rules = promotion?.rules ?? []
    return rules.map((r) => describeRule(r, "rules"))
  }, [promotion])

  const methodType = (promotion?.application_method?.type ?? "").trim().toLowerCase()
  const editSupported =
    summary?.supported === true && (methodType === "percentage" || methodType === "fixed")

  const onToggleStatus = async (nextStatus: "active" | "inactive") => {
    if (!promotion) return
    const question =
      nextStatus === "inactive"
        ? "Выключить акцию? Покупатели перестанут получать эту скидку. Акция останется в списке, её можно включить снова."
        : "Включить акцию? Скидка начнёт действовать для покупателей."
    if (!window.confirm(question)) return
    setStatusBusy(true)
    const res = await updateAdminPromotion(promotion.id, { status: nextStatus })
    setStatusBusy(false)
    if ("status" in res) {
      const err = normalizeAdminError({
        httpStatus: res.status,
        endpoint: `/admin/promotions/${promotion.id}`,
        body: res.body,
      })
      toast.error(err.title, { description: err.action })
      return
    }
    setPromotion(res.promotion)
    setFingerprint(buildPromotionFingerprint(res.promotion))
    toast.success(nextStatus === "inactive" ? "Акция выключена" : "Акция включена")
  }

  const onSaveEdit = async () => {
    if (!promotion) return
    setEditError(null)
    const parsed =
      methodType === "percentage"
        ? parsePercentInput(editValue)
        : parseFixedAmountInput(editValue)
    if (!parsed.ok) {
      setEditError(AMOUNT_ERROR_COPY[parsed.code])
      return
    }
    setEditBusy(true)
    // Stale-edit protection: refetch and compare fingerprints before writing.
    const fresh = await fetchAdminPromotion(promotion.id)
    if ("status" in fresh) {
      setEditBusy(false)
      const err = normalizeAdminError({
        httpStatus: fresh.status,
        endpoint: `/admin/promotions/${promotion.id}`,
        body: fresh.body,
      })
      setEditError(formatAdminErrorPrimary(err))
      return
    }
    const stale = checkPromotionStale(fingerprint, fresh.promotion)
    if (stale.stale) {
      setEditBusy(false)
      const err = normalizeAdminError({ codeHint: "stale_data" })
      setEditError(`${err.title}. ${stale.reason}`)
      setPromotion(fresh.promotion)
      setFingerprint(buildPromotionFingerprint(fresh.promotion))
      return
    }
    const res = await updateAdminPromotion(promotion.id, {
      application_method: { value: parsed.amount },
    })
    setEditBusy(false)
    if ("status" in res) {
      const err = normalizeAdminError({
        httpStatus: res.status,
        endpoint: `/admin/promotions/${promotion.id}`,
        body: res.body,
      })
      setEditError(formatAdminErrorPrimary(err))
      return
    }
    setPromotion(res.promotion)
    setFingerprint(buildPromotionFingerprint(res.promotion))
    setEditOpen(false)
    setEditValue("")
    toast.success("Размер скидки обновлён")
  }

  const onVerify = async () => {
    if (!promotion) return
    const previousStatus = (promotion.status ?? "draft").trim().toLowerCase() || "draft"
    const code = (promotion.code ?? "").trim()
    if (!code) {
      setVerify({
        running: false,
        lines: [],
        verdict: "Проверка невозможна",
        honest_note: "У акции нет кода - проверить её через Store API нельзя",
      })
      return
    }
    const key = resolvePublishableKey()
    if (!key) {
      const err = normalizeAdminError({ codeHint: "publishable_key_missing" })
      setVerify({
        running: false,
        lines: [],
        verdict: err.title,
        honest_note: `${err.explanation} ${err.action}`,
      })
      return
    }
    const variantId = verifyVariant?.variantId?.trim() ?? ""
    if (!variantId) {
      setVerify({
        running: false,
        lines: [],
        verdict: "Выберите товар и вариант",
        honest_note: "Для тестовой корзины нужен вариант, на который акция должна действовать",
      })
      return
    }

    setVerify({ running: true, lines: [], verdict: null, honest_note: null })
    const steps: OperationStepResult[] = []
    let cartId: string | null = null
    let finalCart: Parameters<typeof attributeCartAdjustments>[0]["cart"] | null = null
    let activatedForVerify = false
    let thrownError: unknown = null
    let activateFailedMessage: string | null = null

    const restoreAfterVerify = async () => {
      if (!activatedForVerify) return
      const restoreStatus = previousStatus === "inactive" ? "inactive" : "draft"
      try {
        const restored = await updateAdminPromotion(promotion.id, { status: restoreStatus })
        if ("promotion" in restored) {
          setPromotion(restored.promotion)
          setFingerprint(buildPromotionFingerprint(restored.promotion))
          steps.push({
            step: "restore_status",
            label: "Возврат статуса после проверки",
            status: "ok",
          })
        } else {
          steps.push({
            step: "restore_status",
            label: "Возврат статуса после проверки",
            status: "failed",
            error: "Не удалось вернуть черновик — проверьте статус акции вручную",
          })
        }
      } catch {
        steps.push({
          step: "restore_status",
          label: "Возврат статуса после проверки",
          status: "failed",
          error: "Не удалось вернуть черновик — проверьте статус акции вручную",
        })
      }
    }

    try {
      // Store API applies only active promotions. Temporarily activate draft/inactive,
      // then always restore in finally.
      if (previousStatus !== "active") {
        const act = await updateAdminPromotion(promotion.id, { status: "active" })
        if ("status" in act) {
          const err = normalizeAdminError({
            httpStatus: act.status,
            endpoint: `/admin/promotions/${promotion.id}`,
            body: act.body,
          })
          activateFailedMessage = formatAdminErrorPrimary(err)
        } else {
          activatedForVerify = true
          setPromotion(act.promotion)
          steps.push({
            step: "temp_activate",
            label: "Временное включение для проверки",
            status: "ok",
          })
        }
      }

      if (!activateFailedMessage) {
        const created = await createStoreCart({ publishableKey: key })
        if ("cart" in created) {
          cartId = created.cart.id ?? null
          steps.push({ step: "create_cart", label: "Создание тестовой корзины", status: "ok" })
        } else {
          const err = normalizeAdminError({
            httpStatus: created.status,
            endpoint: "/store/carts",
            body: created.body,
            codeHint: created.status === 0 ? "publishable_key_missing" : "cart_verification_failed",
          })
          steps.push({
            step: "create_cart",
            label: "Создание тестовой корзины",
            status: "failed",
            error: err.title,
          })
        }

        if (cartId) {
          const added = await addStoreCartLineItem(cartId, {
            variant_id: variantId,
            quantity: 1,
            publishableKey: key,
          })
          if ("cart" in added) {
            steps.push({ step: "add_item", label: "Добавление товара", status: "ok" })
          } else {
            const err = normalizeAdminError({
              httpStatus: added.status,
              endpoint: `/store/carts/${cartId}/line-items`,
              body: added.body,
              codeHint: "cart_verification_failed",
            })
            steps.push({
              step: "add_item",
              label: "Добавление товара",
              status: "failed",
              error: err.title,
            })
            cartId = null
          }
        } else {
          steps.push({ step: "add_item", label: "Добавление товара", status: "skipped" })
        }

        if (cartId) {
          const applied = await applyStoreCartPromoCodes(cartId, {
            promo_codes: [code],
            publishableKey: key,
          })
          if ("cart" in applied) {
            steps.push({ step: "apply_code", label: `Применение кода ${code}`, status: "ok" })
            finalCart = applied.cart
          } else {
            const err = normalizeAdminError({
              httpStatus: applied.status,
              endpoint: `/store/carts/${cartId}/promotions`,
              body: applied.body,
              codeHint: "cart_verification_failed",
            })
            steps.push({
              step: "apply_code",
              label: `Применение кода ${code}`,
              status: "failed",
              error: err.title,
            })
          }
        } else {
          steps.push({ step: "apply_code", label: "Применение кода", status: "skipped" })
        }
      }
    } catch (e) {
      thrownError = e
      steps.push({
        step: "verify_exception",
        label: "Проверка прервана ошибкой сети",
        status: "failed",
        error: formatAdminErrorPrimary(
          normalizeAdminError({ error: e, codeHint: "network_error" })
        ),
      })
    } finally {
      await restoreAfterVerify()
    }

    if (activateFailedMessage) {
      setVerify({
        running: false,
        lines: [],
        verdict: "Не удалось временно включить акцию для проверки",
        honest_note: activateFailedMessage,
      })
      return
    }

    const opSummary = summarizeOperationSteps(steps, {
      state_hint_on_partial:
        "Тестовая корзина осталась в изолированной базе - на покупателей это не влияет",
    })

    if (thrownError || !finalCart) {
      setVerify({
        running: false,
        lines: opSummary.lines,
        verdict: "Проверка не завершена - результат не подтверждён",
        honest_note: opSummary.state_hint,
      })
      return
    }

    const attribution = attributeCartAdjustments({
      cart: finalCart,
      expected_codes: [code],
    })
    const perCode = attribution.per_code[0]
    const verdict =
      attribution.verdict === "all_applied"
        ? `Код сработал: скидка ${perCode?.total_amount ?? "неизвестной суммы"} в тестовой корзине`
        : attribution.verdict === "none_applied"
          ? "Код принят, но скидка в корзине не появилась"
          : "Результат неоднозначный - скидки нельзя однозначно связать с кодом"
    const restoreFailed = steps.some((s) => s.step === "restore_status" && s.status === "failed")
    setVerify({
      running: false,
      lines: [...opSummary.lines, attribution.explanation],
      verdict,
      honest_note: [
        activatedForVerify
          ? "Акцию временно включали только на время проверки и вернули в черновик/выключенную."
          : "Акция уже была активна — статус не меняли.",
        restoreFailed
          ? "Внимание: не удалось вернуть прежний статус — проверьте кнопку «Выключить»."
          : attribution.verdict === "all_applied"
            ? "Дальше можно нажать «Включить», если проверка устраивает."
            : "Создание/обновление корзины не обновляет акции автоматически (патч #14149).",
      ]
        .filter(Boolean)
        .join(" "),
    })
  }

  if (!flagOn) {
    return <Navigate to={id ? stockAdminPromotionPath(id) : stockAdminPromotionsPath()} replace />
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Загружаем акцию…</Text>
      </Container>
    )
  }

  if (loadError) {
    const vm = buildAdminErrorViewModel({
      title: loadError.title,
      explanation: loadError.explanation,
      action: loadError.action,
      technical: loadError.technical,
    })
    return (
      <Container className="p-6">
        <Heading level="h1">{vm.primary.title}</Heading>
        <Text className="mt-2">{vm.primary.explanation}</Text>
        <Text className="mt-1">{vm.primary.action}</Text>
        <details className="mt-4">
          <summary>Технические сведения</summary>
          <ul className="mt-2 list-disc pl-5 text-ui-fg-subtle">
            {vm.technicalRows.map((row) => (
              <li key={row.label}>
                {row.label}: {row.value}
              </li>
            ))}
          </ul>
        </details>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" asChild>
            <Link to={stockAdminPromotionsPath()}>К списку акций</Link>
          </Button>
          {id ? (
            <Button variant="secondary" asChild>
              <Link to={stockAdminPromotionPath(id)}>Открыть полную карточку акции</Link>
            </Button>
          ) : null}
        </div>
      </Container>
    )
  }

  if (!promotion || !status || !summary || !impact) {
    return (
      <Container className="p-6">
        <Heading level="h1">Акция не найдена</Heading>
        <Button className="mt-4" variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>К списку акций</Link>
        </Button>
      </Container>
    )
  }

  const rawStatus = (promotion.status ?? "").trim().toLowerCase()

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading level="h1">{summary.text}</Heading>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              color={
                status.tone === "green"
                  ? "green"
                  : status.tone === "red"
                    ? "red"
                    : status.tone === "orange"
                      ? "orange"
                      : status.tone === "blue"
                        ? "blue"
                        : "grey"
              }
            >
              {status.label}
            </Badge>
            {promotion.code ? (
              <Text size="small" className="font-mono">
                {promotion.code}
              </Text>
            ) : null}
          </div>
          {status.reason ? (
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {status.reason}
            </Text>
          ) : null}
          {summary.notes.map((n) => (
            <Text key={n} size="small" className="mt-1 text-ui-fg-subtle">
              {n}
            </Text>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to={stockAdminPromotionsPath()}>К списку акций</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to={stockAdminPromotionPath(promotion.id)}>Полная карточка акции</Link>
          </Button>
          {rawStatus === "active" ? (
            <Button
              variant="secondary"
              disabled={statusBusy}
              onClick={() => onToggleStatus("inactive")}
            >
              Выключить
            </Button>
          ) : rawStatus === "inactive" || rawStatus === "draft" ? (
            <Button disabled={statusBusy} onClick={() => onToggleStatus("active")}>
              Включить
            </Button>
          ) : null}
        </div>
      </div>

      {!summary.supported ? (
        <Container className="border border-ui-border-strong p-3">
          <Text weight="plus">Эту акцию здесь не редактируем</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {summary.fallback_reason}
          </Text>
          <Button className="mt-2" size="small" variant="secondary" asChild>
            <Link to={stockAdminPromotionPath(promotion.id)}>Открыть полную карточку акции</Link>
          </Button>
        </Container>
      ) : null}

      <Container className="p-4">
        <Text weight="plus">Охват</Text>
        <Text size="small" className="mt-1">
          {impact.headline}
        </Text>
        {impact.notes.map((n) => (
          <Text key={n} size="xsmall" className="mt-1 text-ui-fg-subtle">
            {n}
          </Text>
        ))}
      </Container>

      <Container className="p-4">
        <Text weight="plus">На что действует</Text>
        {!targetDescriptions.length ? (
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Отдельных условий по товарам нет
          </Text>
        ) : (
          <ul className="mt-1 list-disc pl-5">
            {targetDescriptions.map((d, i) => (
              <li key={i}>
                <Text size="small">
                  {d.kind === "supported" ? d.text : `Нераспознанное условие: ${d.reason}`}
                </Text>
              </li>
            ))}
          </ul>
        )}
        <Text weight="plus" className="mt-3">
          Дополнительные условия
        </Text>
        {!conditionDescriptions.length ? (
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Дополнительных условий нет
          </Text>
        ) : (
          <ul className="mt-1 list-disc pl-5">
            {conditionDescriptions.map((d, i) => (
              <li key={i}>
                <Text size="small">
                  {d.kind === "supported" ? d.text : `Нераспознанное условие: ${d.reason}`}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container className="p-4">
        <Text weight="plus">Кампания</Text>
        <Text size="small" className="mt-1">
          {promotion.campaign ? describeCampaign(promotion.campaign) : "Акция вне кампаний"}
        </Text>
      </Container>

      {editSupported ? (
        <Container className="p-4">
          <div className="flex items-center justify-between">
            <Text weight="plus">Размер скидки</Text>
            {!editOpen ? (
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  setEditOpen(true)
                  setEditValue(String(promotion.application_method?.value ?? ""))
                  setEditError(null)
                }}
              >
                Изменить
              </Button>
            ) : null}
          </div>
          {editOpen ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                className="max-w-40"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                aria-label={
                  methodType === "percentage" ? "Новый процент скидки" : "Новая сумма скидки"
                }
                placeholder={methodType === "percentage" ? "например 15" : "например 3000"}
              />
              <Text size="small" className="text-ui-fg-subtle">
                {methodType === "percentage" ? "процентов" : "рублей"}
              </Text>
              <Button size="small" onClick={onSaveEdit} disabled={editBusy} isLoading={editBusy}>
                Сохранить
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={editBusy}
                onClick={() => {
                  setEditOpen(false)
                  setEditError(null)
                }}
              >
                Отмена
              </Button>
            </div>
          ) : null}
          {editError ? (
            <Text size="small" className="mt-2 text-ui-fg-error">
              {editError}
            </Text>
          ) : null}
          <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
            Остальные параметры (условия, код, кампания) — на полной карточке акции
          </Text>
        </Container>
      ) : null}

      <Container className="p-4">
        <div className="flex items-center justify-between">
          <Text weight="plus">Проверка в корзине</Text>
          <Button size="small" variant="secondary" onClick={() => setVerifyOpen(!verifyOpen)}>
            {verifyOpen ? "Свернуть" : "Проверить"}
          </Button>
        </div>
        {verifyOpen ? (
          <div className="mt-2 flex flex-col gap-2">
            <Text size="small" className="text-ui-fg-subtle">
              Соберём тестовую корзину и применим код акции. Черновик временно включается только на
              время проверки, затем возвращается. Ключ витрины берётся из конфигурации сервера —
              вводить его не нужно.
            </Text>
            <VerifyVariantPicker
              value={verifyVariant}
              onChange={setVerifyVariant}
              disabled={verify.running}
            />
            <div>
              <Button
                size="small"
                onClick={onVerify}
                disabled={verify.running}
                isLoading={verify.running}
              >
                Запустить проверку
              </Button>
            </div>
            {verify.verdict ? (
              <div className="mt-1">
                <Text weight="plus" size="small">
                  {verify.verdict}
                </Text>
                {verify.lines.map((l) => (
                  <Text key={l} size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {l}
                  </Text>
                ))}
                {verify.honest_note ? (
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {verify.honest_note}
                  </Text>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Container>

      <Container className="p-4">
        <details>
          <summary>Технические сведения</summary>
          <div className="mt-2 flex flex-col gap-1 text-ui-fg-subtle">
            <Text size="xsmall">Promotion ID: {promotion.id}</Text>
            <Text size="xsmall">type: {promotion.type ?? "—"}</Text>
            <Text size="xsmall">status: {promotion.status ?? "—"}</Text>
            <Text size="xsmall">
              application_method.type: {promotion.application_method?.type ?? "—"}
            </Text>
            <Text size="xsmall">
              application_method.target_type: {promotion.application_method?.target_type ?? "—"}
            </Text>
            <Text size="xsmall">
              application_method.allocation: {promotion.application_method?.allocation ?? "—"}
            </Text>
            <Text size="xsmall">
              application_method.value: {String(promotion.application_method?.value ?? "—")}
            </Text>
            <Text size="xsmall">
              currency_code: {promotion.application_method?.currency_code ?? "—"}
            </Text>
            <Text size="xsmall">campaign_id: {promotion.campaign_id ?? "—"}</Text>
            <Text size="xsmall">updated_at: {promotion.updated_at ?? "—"}</Text>
          </div>
        </details>
      </Container>

      <div>
        <Button variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>Все акции</Link>
        </Button>
      </div>
    </div>
  )
}

// No defineRouteConfig on purpose: the route is reachable from the list page,
// and the SDK `nested` union does not include custom sidebar paths.
export default PromotionDetailPage
