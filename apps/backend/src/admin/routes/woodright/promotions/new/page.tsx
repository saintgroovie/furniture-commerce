import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { readWoodrightAdminUxFlagFromBrowser } from "../../../../lib/woodright/browser-flag"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../../../../lib/errors/normalize-admin-error"
import {
  createAdminPromotion,
  fetchAdminCampaigns,
  fetchRuleValueOptions,
  stockAdminPromotionsPath,
  woodrightPromotionPath,
  woodrightPromotionsPath,
} from "../../../../lib/promotions/api"
import {
  buildCreatePromotionPayload,
  type PromotionWizardValues,
} from "../../../../lib/promotions/payload"
import {
  AMOUNT_ERROR_COPY,
  formatFixedAmount,
  formatPercent,
  parseFixedAmountInput,
  parsePercentInput,
} from "../../../../lib/promotions/amount"
import { checkCampaignCompatibility, describeCampaign } from "../../../../lib/promotions/campaign"
import type { AdminCampaignDto } from "../../../../lib/promotions/types"

type StepId = "result" | "trigger" | "scope" | "conditions" | "campaign" | "summary"

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "result", label: "Скидка" },
  { id: "trigger", label: "Код или автомат" },
  { id: "scope", label: "На что действует" },
  { id: "conditions", label: "Исключения" },
  { id: "campaign", label: "Кампания и даты" },
  { id: "summary", label: "Проверка и создание" },
]

type PickedOption = { value: string; label: string }

type PickerProps = {
  ruleAttributeId: "items.product.id" | "items.product.collection_id"
  placeholder: string
  picked: PickedOption[]
  onChange: (next: PickedOption[]) => void
}

const RuleValuePicker = ({ ruleAttributeId, placeholder, picked, onChange }: PickerProps) => {
  const [q, setQ] = useState("")
  const [options, setOptions] = useState<PickedOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      try {
        const res = await fetchRuleValueOptions(
          "target-rules",
          ruleAttributeId,
          { q: q || undefined, limit: 20 },
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        if ("status" in res) {
          setSearchError(
            formatAdminErrorPrimary(
              normalizeAdminError({
                httpStatus: res.status,
                endpoint: `/admin/promotions/rule-value-options/target-rules/${ruleAttributeId}`,
                body: res.body,
              })
            )
          )
          setOptions([])
          return
        }
        setOptions(
          res.values
            .map((v) => ({
              value: (v.value ?? "").trim(),
              label: (v.label ?? v.value ?? "").trim(),
            }))
            .filter((v) => v.value)
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
    }, 300)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [q, ruleAttributeId])

  const pickedValues = new Set(picked.map((p) => p.value))

  return (
    <div className="flex flex-col gap-2">
      {picked.length ? (
        <div className="flex flex-wrap gap-1">
          {picked.map((p) => (
            <Badge key={p.value}>
              {p.label}
              <button
                type="button"
                className="ml-1"
                aria-label={`Убрать ${p.label}`}
                onClick={() => onChange(picked.filter((x) => x.value !== p.value))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {searchError ? (
        <Text size="xsmall" className="text-ui-fg-error">
          {searchError}
        </Text>
      ) : null}
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {searching ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            Ищем…
          </Text>
        ) : (
          options
            .filter((o) => !pickedValues.has(o.value))
            .map((o) => (
              <button
                key={o.value}
                type="button"
                className="rounded px-2 py-1 text-left hover:bg-ui-bg-subtle"
                onClick={() => onChange([...picked, o])}
              >
                <Text size="small">{o.label}</Text>
              </button>
            ))
        )}
      </div>
    </div>
  )
}

const PromotionWizardPage = () => {
  const flagOn = readWoodrightAdminUxFlagFromBrowser()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedProductId = searchParams.get("product_id")

  const [step, setStep] = useState<StepId>("result")
  const [stepError, setStepError] = useState<string | null>(null)

  // Step 1 — result
  const [kind, setKind] = useState<"percentage" | "fixed" | "buyget" | "free_shipping">(
    "percentage"
  )
  const [percentRaw, setPercentRaw] = useState("")
  const [amountRaw, setAmountRaw] = useState("")

  // Step 2 — trigger
  const [trigger, setTrigger] = useState<"code" | "automatic">("code")
  const [code, setCode] = useState("")

  // Step 3 — scope
  const [scope, setScope] = useState<"order" | "products" | "collections">(
    preselectedProductId ? "products" : "order"
  )
  const [pickedProducts, setPickedProducts] = useState<PickedOption[]>(
    preselectedProductId
      ? [{ value: preselectedProductId, label: `Товар ${preselectedProductId}` }]
      : []
  )
  const [pickedCollections, setPickedCollections] = useState<PickedOption[]>([])

  // Step 4 — exclusions
  const [excludedProducts, setExcludedProducts] = useState<PickedOption[]>([])

  // Step 5 — campaign (existing only; inline create → stock Admin)
  const [campaignMode, setCampaignMode] = useState<"none" | "existing">("none")
  const [campaigns, setCampaigns] = useState<AdminCampaignDto[]>([])
  const [campaignsError, setCampaignsError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState("")

  // Step 6 — create
  const [activateOnCreate, setActivateOnCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createErrors, setCreateErrors] = useState<string[]>([])

  useEffect(() => {
    if (!flagOn || campaignMode !== "existing" || campaigns.length) return
    const ac = new AbortController()
    ;(async () => {
      const res = await fetchAdminCampaigns({ limit: 50 }, { signal: ac.signal }).catch(
        () => null
      )
      if (ac.signal.aborted || !res) return
      if ("status" in res) {
        setCampaignsError(
          formatAdminErrorPrimary(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: "/admin/campaigns",
              body: res.body,
            })
          )
        )
        return
      }
      setCampaigns(res.campaigns)
    })()
    return () => ac.abort()
  }, [flagOn, campaignMode, campaigns.length])

  const wizardValues = useMemo((): PromotionWizardValues | null => {
    if (kind === "buyget" || kind === "free_shipping") return null
    const percent = parsePercentInput(percentRaw)
    const amount = parseFixedAmountInput(amountRaw)
    return {
      trigger,
      code,
      kind,
      percent: kind === "percentage" && percent.ok ? percent.amount : null,
      amount: kind === "fixed" && amount.ok ? amount.amount : null,
      currency_code: "rub",
      scope,
      product_ids: pickedProducts.map((p) => p.value),
      collection_ids: pickedCollections.map((c) => c.value),
      excluded_product_ids: excludedProducts.map((p) => p.value),
      status: activateOnCreate ? "active" : "draft",
      campaign_id: campaignMode === "existing" && campaignId ? campaignId : null,
      campaign: null,
    }
  }, [
    kind,
    percentRaw,
    amountRaw,
    trigger,
    code,
    scope,
    pickedProducts,
    pickedCollections,
    excludedProducts,
    activateOnCreate,
    campaignMode,
    campaignId,
  ])

  const selectedCampaign = campaigns.find((c) => c.id === campaignId) ?? null
  const campaignCompat =
    campaignMode === "existing" && selectedCampaign
      ? checkCampaignCompatibility({
          promotion_currency_code: kind === "fixed" ? "rub" : null,
          campaign: selectedCampaign,
        })
      : null

  const goNext = () => {
    setStepError(null)
    if (step === "result") {
      if (kind === "buyget" || kind === "free_shipping") return
      if (kind === "percentage") {
        const parsed = parsePercentInput(percentRaw)
        if (!parsed.ok) {
          setStepError(AMOUNT_ERROR_COPY[parsed.code])
          return
        }
      } else {
        const parsed = parseFixedAmountInput(amountRaw)
        if (!parsed.ok) {
          setStepError(AMOUNT_ERROR_COPY[parsed.code])
          return
        }
      }
      setStep("trigger")
      return
    }
    if (step === "trigger") {
      if (!code.trim()) {
        setStepError(
          trigger === "automatic"
            ? "Код нужен даже автоматической акции - он служит служебным идентификатором"
            : "Укажите код, который покупатель введёт в корзине"
        )
        return
      }
      setStep("scope")
      return
    }
    if (step === "scope") {
      if (scope === "products" && !pickedProducts.length) {
        setStepError("Выберите хотя бы один товар")
        return
      }
      if (scope === "collections" && !pickedCollections.length) {
        setStepError("Выберите хотя бы одну коллекцию")
        return
      }
      setStep("conditions")
      return
    }
    if (step === "conditions") {
      setStep("campaign")
      return
    }
    if (step === "campaign") {
      if (campaignMode === "existing" && !campaignId) {
        setStepError("Выберите кампанию или переключитесь на «Без кампании»")
        return
      }
      if (campaignCompat && !campaignCompat.ok) {
        setStepError(campaignCompat.errors.join(". "))
        return
      }
      setStep("summary")
    }
  }

  const goBack = () => {
    setStepError(null)
    const idx = STEPS.findIndex((s) => s.id === step)
    if (idx > 0) setStep(STEPS[idx - 1].id)
  }

  const onCreate = async () => {
    if (!wizardValues) return
    setCreateErrors([])
    const built = buildCreatePromotionPayload(wizardValues)
    if (!built.ok) {
      setCreateErrors(built.errors)
      return
    }
    setCreating(true)
    const res = await createAdminPromotion(built.payload)
    setCreating(false)
    if ("status" in res) {
      const err = normalizeAdminError({
        httpStatus: res.status,
        endpoint: "/admin/promotions",
        body: res.body,
      })
      setCreateErrors([formatAdminErrorPrimary(err)])
      toast.error(err.title, { description: err.action })
      return
    }
    toast.success(
      activateOnCreate ? "Акция создана и включена" : "Акция создана как черновик"
    )
    navigate(woodrightPromotionPath(res.promotion.id))
  }

  if (!flagOn) {
    return (
      <Container className="p-6">
        <Heading level="h1">Новая акция</Heading>
        <Text className="mt-2 text-ui-fg-subtle">
          Функция выключена. Включите флаг WOODRIGHT_ADMIN_UX_V1 и обновите страницу.
        </Text>
        <Button className="mt-4" variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>Создать в стандартной админке</Link>
        </Button>
      </Container>
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Новая акция</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Шаг {stepIndex + 1} из {STEPS.length}: {STEPS[stepIndex].label}
          </Text>
        </div>
        <Button variant="secondary" asChild>
          <Link to={woodrightPromotionsPath()}>К списку акций</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <Badge key={s.id} color={i === stepIndex ? "blue" : i < stepIndex ? "green" : "grey"}>
            {s.label}
          </Badge>
        ))}
      </div>

      {step === "result" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Какую скидку даёт акция</Text>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "percentage"}
                onChange={() => setKind("percentage")}
              />
              <Text size="small">Процент от цены</Text>
            </label>
            {kind === "percentage" ? (
              <div className="ml-6 flex items-center gap-2">
                <Input
                  className="max-w-32"
                  value={percentRaw}
                  onChange={(e) => setPercentRaw(e.target.value)}
                  placeholder="например 10"
                  aria-label="Процент скидки"
                />
                <Text size="small" className="text-ui-fg-subtle">
                  процентов, от 0 до 100
                </Text>
              </div>
            ) : null}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "fixed"}
                onChange={() => setKind("fixed")}
              />
              <Text size="small">Фиксированная сумма в рублях</Text>
            </label>
            {kind === "fixed" ? (
              <div className="ml-6 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    className="max-w-32"
                    value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value)}
                    placeholder="например 3000"
                    aria-label="Сумма скидки в рублях"
                  />
                  <Text size="small" className="text-ui-fg-subtle">
                    рублей
                  </Text>
                </div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Базовые цены товаров не изменятся - сумма вычитается в корзине
                </Text>
              </div>
            ) : null}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "buyget"}
                onChange={() => setKind("buyget")}
              />
              <Text size="small">Купи X - получи Y</Text>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "free_shipping"}
                onChange={() => setKind("free_shipping")}
              />
              <Text size="small">Бесплатная доставка</Text>
            </label>
          </div>
          {kind === "buyget" || kind === "free_shipping" ? (
            <Container className="border border-ui-border-strong p-3">
              <Text size="small" weight="plus">
                Этот вид акции пока настраивается в стандартной админке
              </Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Woodright добавит его после проверки на реальной корзине
              </Text>
              <Button className="mt-2" size="small" variant="secondary" asChild>
                <Link to={stockAdminPromotionsPath()}>Открыть стандартную админку</Link>
              </Button>
            </Container>
          ) : null}
        </Container>
      ) : null}

      {step === "trigger" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Как акция срабатывает</Text>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="trigger"
              checked={trigger === "code"}
              onChange={() => setTrigger("code")}
            />
            <Text size="small">По коду - покупатель вводит его в корзине</Text>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="trigger"
              checked={trigger === "automatic"}
              onChange={() => setTrigger("automatic")}
            />
            <Text size="small">Автоматически - без кода со стороны покупателя</Text>
          </label>
          <div>
            <Text size="small" weight="plus">
              Код акции
            </Text>
            <Input
              className="mt-1 max-w-xs font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SUMMER10"
              aria-label="Код акции"
            />
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Латинские буквы, цифры, дефис и подчёркивание. Регистр сохраняется как ввели.
              Код обязателен даже для автоматических акций - там он служит служебным
              идентификатором
            </Text>
          </div>
        </Container>
      ) : null}

      {step === "scope" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">На что действует скидка</Text>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === "order"}
              onChange={() => setScope("order")}
            />
            <Text size="small">Весь заказ</Text>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === "products"}
              onChange={() => setScope("products")}
            />
            <Text size="small">Выбранные товары</Text>
          </label>
          {scope === "products" ? (
            <div className="ml-6">
              <RuleValuePicker
                ruleAttributeId="items.product.id"
                placeholder="Поиск товара по названию"
                picked={pickedProducts}
                onChange={setPickedProducts}
              />
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Скидка действует на товар целиком. Отдельные варианты (цвет, размер) выбрать
                нельзя - это ограничение Medusa
              </Text>
            </div>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === "collections"}
              onChange={() => setScope("collections")}
            />
            <Text size="small">Коллекции</Text>
          </label>
          {scope === "collections" ? (
            <div className="ml-6">
              <RuleValuePicker
                ruleAttributeId="items.product.collection_id"
                placeholder="Поиск коллекции"
                picked={pickedCollections}
                onChange={setPickedCollections}
              />
            </div>
          ) : null}
        </Container>
      ) : null}

      {step === "conditions" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Исключения</Text>
          {scope === "order" ? (
            <Text size="small" className="text-ui-fg-subtle">
              Для скидки на весь заказ исключения по товарам недоступны. Вернитесь назад и
              выберите «Выбранные товары» или «Коллекции», если нужны исключения
            </Text>
          ) : (
            <>
              <Text size="small" className="text-ui-fg-subtle">
                Товары из этого списка не получат скидку, даже если попадают под условия
              </Text>
              <RuleValuePicker
                ruleAttributeId="items.product.id"
                placeholder="Поиск товара для исключения"
                picked={excludedProducts}
                onChange={setExcludedProducts}
              />
            </>
          )}
        </Container>
      ) : null}

      {step === "campaign" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Кампания и даты</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Даты начала и окончания живут на кампании. Акция без кампании действует, пока её не
            выключат вручную
          </Text>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="campaign"
              checked={campaignMode === "none"}
              onChange={() => setCampaignMode("none")}
            />
            <Text size="small">Без кампании</Text>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="campaign"
              checked={campaignMode === "existing"}
              onChange={() => setCampaignMode("existing")}
            />
            <Text size="small">Существующая кампания</Text>
          </label>
          {campaignMode === "existing" ? (
            <div className="ml-6 flex flex-col gap-2">
              {campaignsError ? (
                <Text size="xsmall" className="text-ui-fg-error">
                  {campaignsError}
                </Text>
              ) : null}
              <select
                className="w-full max-w-md rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2"
                value={campaignId}
                aria-label="Кампания"
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">Выберите кампанию…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {describeCampaign(c)}
                  </option>
                ))}
              </select>
              {campaignCompat?.errors.map((e) => (
                <Text key={e} size="xsmall" className="text-ui-fg-error">
                  {e}
                </Text>
              ))}
              {campaignCompat?.warnings.map((w) => (
                <Text key={w} size="xsmall" className="text-ui-fg-subtle">
                  {w}
                </Text>
              ))}
            </div>
          ) : null}
          <div className="rounded-md border border-ui-border-base p-3">
            <Text size="small" weight="plus">
              Новая кампания
            </Text>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Создание кампании вместе с акцией в Woodright пока отключено — сначала создайте
              кампанию в стандартной админке, затем выберите её здесь. Так мы не оставляем
              частичное состояние «кампания есть, акции нет».
            </Text>
            <Button className="mt-2" size="small" variant="secondary" asChild>
              <Link to="/app/campaigns">Открыть кампании в стандартной админке</Link>
            </Button>
          </div>
        </Container>
      ) : null}

      {step === "summary" && wizardValues ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Проверьте акцию перед созданием</Text>
          <ul className="list-disc pl-5">
            <li>
              <Text size="small">
                Скидка:{" "}
                {kind === "percentage"
                  ? wizardValues.percent != null
                    ? formatPercent(wizardValues.percent)
                    : "не задана"
                  : wizardValues.amount != null
                    ? `${formatFixedAmount(wizardValues.amount, "rub")} (базовые цены не меняются)`
                    : "не задана"}
              </Text>
            </li>
            <li>
              <Text size="small">
                Срабатывание:{" "}
                {trigger === "automatic" ? "автоматически" : `по коду ${code.trim()}`}
              </Text>
            </li>
            <li>
              <Text size="small">
                Область:{" "}
                {scope === "order"
                  ? "весь заказ"
                  : scope === "products"
                    ? `товары (${pickedProducts.length}): ${pickedProducts.map((p) => p.label).join(", ")}`
                    : `коллекции (${pickedCollections.length}): ${pickedCollections.map((c) => c.label).join(", ")}`}
              </Text>
            </li>
            {excludedProducts.length ? (
              <li>
                <Text size="small">
                  Исключения: {excludedProducts.map((p) => p.label).join(", ")}
                </Text>
              </li>
            ) : null}
            <li>
              <Text size="small">
                Кампания:{" "}
                {campaignMode === "none"
                  ? "без кампании"
                  : selectedCampaign
                    ? describeCampaign(selectedCampaign)
                    : campaignId}
              </Text>
            </li>
          </ul>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={activateOnCreate}
              onChange={(e) => setActivateOnCreate(e.target.checked)}
            />
            <Text size="small">Создать и сразу включить</Text>
          </label>
          {!activateOnCreate ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              По умолчанию акция создаётся выключенной (черновик) - включите её после проверки
            </Text>
          ) : null}
          {createErrors.map((e) => (
            <Text key={e} size="small" className="text-ui-fg-error">
              {e}
            </Text>
          ))}
          <div>
            <Button onClick={onCreate} disabled={creating} isLoading={creating}>
              {activateOnCreate ? "Создать и включить" : "Создать как черновик"}
            </Button>
          </div>
        </Container>
      ) : null}

      {stepError ? (
        <Container className="border border-ui-border-error p-3">
          <Text size="small">{stepError}</Text>
        </Container>
      ) : null}

      <div className="flex gap-2">
        {stepIndex > 0 ? (
          <Button variant="secondary" onClick={goBack}>
            Назад
          </Button>
        ) : null}
        {step !== "summary" && kind !== "buyget" && kind !== "free_shipping" ? (
          <Button onClick={goNext}>Дальше</Button>
        ) : null}
      </div>
    </div>
  )
}

// No defineRouteConfig on purpose: the wizard opens from the list page and the
// product workspace; the SDK `nested` union does not include custom paths.
export default PromotionWizardPage
