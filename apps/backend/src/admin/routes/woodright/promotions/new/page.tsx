import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { readWoodrightAdminUxFlagFromBrowser } from "../../../../lib/woodright/browser-flag"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../../../../lib/errors/normalize-admin-error"
import {
  createAdminPromotion,
  fetchRuleValueOptions,
  stockAdminPromotionsPath,
  woodrightPromotionPath,
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

type StepId = "result" | "trigger" | "scope" | "conditions" | "summary"

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "result", label: "Скидка" },
  { id: "trigger", label: "Код или автомат" },
  { id: "scope", label: "На что действует" },
  { id: "conditions", label: "Исключения" },
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

  const [kind, setKind] = useState<"percentage" | "fixed">("percentage")
  const [percentRaw, setPercentRaw] = useState("")
  const [amountRaw, setAmountRaw] = useState("")

  const [trigger, setTrigger] = useState<"code" | "automatic">("code")
  const [code, setCode] = useState("")

  const [scope, setScope] = useState<"order" | "products" | "collections">(
    preselectedProductId ? "products" : "order"
  )
  const [pickedProducts, setPickedProducts] = useState<PickedOption[]>(
    preselectedProductId
      ? [{ value: preselectedProductId, label: "Выбранный товар" }]
      : []
  )
  const [pickedCollections, setPickedCollections] = useState<PickedOption[]>([])
  const [excludedProducts, setExcludedProducts] = useState<PickedOption[]>([])

  const [creating, setCreating] = useState(false)
  const [createErrors, setCreateErrors] = useState<string[]>([])

  const wizardValues = useMemo((): PromotionWizardValues => {
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
      status: "draft",
      campaign_id: null,
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
  ])

  const goNext = () => {
    setStepError(null)
    if (step === "result") {
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
            ? "Код нужен даже автоматической акции — это служебный идентификатор в системе"
            : "Укажите код акции (служебный идентификатор). На текущей витрине поля для ввода промокода нет"
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
      setStep("summary")
    }
  }

  const goBack = () => {
    setStepError(null)
    const idx = STEPS.findIndex((s) => s.id === step)
    if (idx > 0) setStep(STEPS[idx - 1].id)
  }

  const onCreate = async () => {
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
    toast.success("Черновик акции создан — проверьте расчёт в тестовой корзине, затем включите")
    navigate(woodrightPromotionPath(res.promotion.id))
  }

  if (!flagOn) {
    return <Navigate to={stockAdminPromotionsPath()} replace />
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Простая акция</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Шаг {stepIndex + 1} из {STEPS.length}: {STEPS[stepIndex].label}. Без расписания;
            включение и выключение вручную после проверки.
          </Text>
        </div>
        <Button variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>К списку акций</Link>
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
          <Text size="xsmall" className="text-ui-fg-subtle">
            Мастер создаёт только процент или фиксированную сумму в рублях.
          </Text>
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
                  Базовые цены товаров не изменятся — скидка считается в тестовой корзине
                </Text>
              </div>
            ) : null}
          </div>
        </Container>
      ) : null}

      {step === "trigger" ? (
        <Container className="flex flex-col gap-3 p-4">
          <Text weight="plus">Как акция срабатывает в системе</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            На текущей витрине нет поля промокода и нет автоприменения скидок в корзине покупателя.
            Мастер настраивает правила скидок; доставка скидки покупателю — отдельная задача.
          </Text>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="trigger"
              checked={trigger === "code"}
              onChange={() => setTrigger("code")}
            />
            <Text size="small">По коду — применяется в системе скидок (на витрине поля ввода нет)</Text>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="trigger"
              checked={trigger === "automatic"}
              onChange={() => setTrigger("automatic")}
            />
            <Text size="small">
              Автоматическая в системе — автообновление корзины отключено (патч #14149)
            </Text>
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
              Латинские буквы, цифры, дефис и подчёркивание. Регистр сохраняется как ввели. Код
              обязателен даже для автоматических акций — там он служебный идентификатор.
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
                нельзя — так устроена система скидок
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

      {step === "summary" ? (
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
                Срабатывание в системе:{" "}
                {trigger === "automatic"
                  ? "автоматическая (на витрине автоприменение сейчас недоступно)"
                  : `по коду ${code.trim()} (на витрине поля ввода промокода нет)`}
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
              <Text size="small">Расписание: без кампании — включение и выключение вручную</Text>
            </li>
            <li>
              <Text size="small">Статус после создания: черновик (выключена)</Text>
            </li>
            <li>
              <Text size="small">
                Дальше: проверить расчёт в тестовой корзине → включить правило. Это не проверка доставки
                скидки на витрине.
              </Text>
            </li>
          </ul>
          {createErrors.map((e) => (
            <Text key={e} size="small" className="text-ui-fg-error">
              {e}
            </Text>
          ))}
          <div>
            <Button onClick={onCreate} disabled={creating} isLoading={creating}>
              Создать черновик
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
        {step !== "summary" ? (
          <Button onClick={goNext}>Дальше</Button>
        ) : null}
      </div>
    </div>
  )
}

// No defineRouteConfig on purpose: the wizard opens from the list page and the
// product workspace; the SDK `nested` union does not include custom paths.
export default PromotionWizardPage
