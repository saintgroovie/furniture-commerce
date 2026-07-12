export type AdminErrorCode =
  | "validation"
  | "required"
  | "duplicate_sku"
  | "duplicate_option_combo"
  | "missing_price"
  | "invalid_price"
  | "negative_amount"
  | "missing_price_set"
  | "price_not_found"
  | "rule_based_price_unsupported"
  | "partial_bulk_failure"
  | "invalid_currency"
  | "missing_inventory"
  | "forbidden"
  | "expired_session"
  | "upload_error"
  | "unsupported_file"
  | "oversized_file"
  | "network_error"
  | "timeout"
  | "conflict"
  | "stale_data"
  | "deleted_entity"
  | "promotion_rule_error"
  | "invalid_date_range"
  | "campaign_constraint"
  // Package E (promotions workspace)
  | "duplicate_promo_code"
  | "invalid_promotion_type"
  | "invalid_promotion_value"
  | "promotion_unsupported"
  | "campaign_budget_conflict"
  | "publishable_key_missing"
  | "cart_verification_failed"
  | "promo_code_not_applied"
  | "unknown"

export type AdminErrorTechnical = {
  httpStatus?: number
  endpoint?: string
  errorCode?: string
  requestId?: string
  rawMessage?: string
  timestamp: string
}

export type NormalizedAdminError = {
  code: AdminErrorCode
  title: string
  explanation: string
  action: string
  technical: AdminErrorTechnical
}

type CatalogEntry = {
  title: string
  explanation: string
  action: string
}

const CATALOG: Record<AdminErrorCode, CatalogEntry> = {
  validation: {
    title: "Не удалось сохранить",
    explanation: "Некоторые поля заполнены неверно.",
    action: "Исправьте отмеченные поля и сохраните снова.",
  },
  required: {
    title: "Не хватает обязательных данных",
    explanation: "Без этих полей сохранить нельзя.",
    action: "Заполните поля и повторите.",
  },
  duplicate_sku: {
    title: "Такой артикул уже есть",
    explanation: "Артикул должен быть уникальным.",
    action: "Измените SKU и сохраните.",
  },
  duplicate_option_combo: {
    title: "Такой вариант уже существует",
    explanation: "Комбинация опций повторяется.",
    action: "Измените опции или откройте существующий вариант.",
  },
  missing_price: {
    title: "Нет цены",
    explanation: "У варианта нет цены в нужной валюте.",
    action: "Добавьте цену в рублях и сохраните.",
  },
  invalid_price: {
    title: "Некорректная цена",
    explanation: "Сумма не подходит для сохранения.",
    action: "Введите целое число ≥ 0 без скрытых копеек и повторите.",
  },
  negative_amount: {
    title: "Отрицательная сумма",
    explanation: "Цена не может быть меньше нуля.",
    action: "Введите 0 или положительную сумму.",
  },
  missing_price_set: {
    title: "Нет набора цен",
    explanation: "У варианта нет связанного price set.",
    action: "Откройте варианты в стандартной админке и проверьте цены.",
  },
  price_not_found: {
    title: "Цена не найдена",
    explanation: "Выбранная цена больше не существует.",
    action: "Обновите страницу и выберите актуальную цену.",
  },
  rule_based_price_unsupported: {
    title: "Сложная цена",
    explanation: "У цены есть правила, прайс-лист или лимиты количества.",
    action: "Измените её в стандартной админке, чтобы не затереть правила.",
  },
  partial_bulk_failure: {
    title: "Часть изменений не применилась",
    explanation: "Массовая операция завершилась с ошибками по отдельным вариантам.",
    action: "Посмотрите отчёт и повторите только неудавшиеся строки.",
  },
  invalid_currency: {
    title: "Неверная валюта",
    explanation: "Указана валюта, которую магазин не использует.",
    action: "Выберите RUB (или валюту региона) и повторите.",
  },
  missing_inventory: {
    title: "Нет связи со складом",
    explanation: "Нельзя учесть остаток без складской записи.",
    action: "Назначьте склад и повторите.",
  },
  forbidden: {
    title: "Недостаточно прав",
    explanation: "У вашей учётки нет доступа к действию.",
    action: "Обратитесь к администратору.",
  },
  expired_session: {
    title: "Сессия истекла",
    explanation: "Нужно войти снова.",
    action: "Обновите страницу и войдите.",
  },
  upload_error: {
    title: "Не удалось загрузить файл",
    explanation: "Файл не сохранён.",
    action: "Проверьте файл и повторите загрузку.",
  },
  unsupported_file: {
    title: "Формат файла не подходит",
    explanation: "Этот тип файла не принимается.",
    action: "Загрузите JPG или PNG.",
  },
  oversized_file: {
    title: "Файл слишком большой",
    explanation: "Превышен допустимый размер.",
    action: "Уменьшите файл и повторите.",
  },
  network_error: {
    title: "Нет связи с сервером",
    explanation: "Запрос не дошёл.",
    action: "Проверьте сеть и повторите.",
  },
  timeout: {
    title: "Сервер долго не отвечает",
    explanation: "Запрос прерван по времени.",
    action: "Повторите попытку.",
  },
  conflict: {
    title: "Данные уже изменились",
    explanation: "Пока вы редактировали, запись обновилась.",
    action: "Обновите страницу и внесите изменения снова.",
  },
  stale_data: {
    title: "Устаревшие данные на экране",
    explanation: "Сохранение отклонено, чтобы не затереть чужие правки.",
    action: "Обновите и повторите.",
  },
  deleted_entity: {
    title: "Запись удалена",
    explanation: "Объект больше не существует.",
    action: "Вернитесь к списку.",
  },
  promotion_rule_error: {
    title: "Не удалось настроить условие акции",
    explanation: "Условие не принято системой.",
    action: "Упростите условие или выберите другие товары.",
  },
  invalid_date_range: {
    title: "Неверный период",
    explanation: "Дата окончания раньше даты начала.",
    action: "Исправьте даты.",
  },
  campaign_constraint: {
    title: "Ограничение кампании",
    explanation: "Акция не совместима с правилами кампании.",
    action: "Измените лимиты или кампанию.",
  },
  duplicate_promo_code: {
    title: "Такой код акции уже есть",
    explanation: "Код должен быть уникальным среди всех акций.",
    action: "Придумайте другой код и сохраните.",
  },
  invalid_promotion_type: {
    title: "Такой вид акции не поддерживается",
    explanation: "Сочетание типа скидки и области действия не принято системой.",
    action: "Настройте эту акцию в стандартной админке.",
  },
  invalid_promotion_value: {
    title: "Некорректный размер скидки",
    explanation: "Процент должен быть от 0 до 100, сумма - больше нуля.",
    action: "Исправьте значение и сохраните.",
  },
  promotion_unsupported: {
    title: "Акция сложного типа",
    explanation: "Woodright не управляет этим видом акций, чтобы ничего не сломать.",
    action: "Откройте акцию в стандартной админке.",
  },
  campaign_budget_conflict: {
    title: "Конфликт с бюджетом кампании",
    explanation: "Валюта или тип бюджета кампании не подходит этой акции.",
    action: "Выберите другую кампанию или измените бюджет в стандартной админке.",
  },
  publishable_key_missing: {
    title: "Нет ключа магазина для проверки",
    explanation:
      "Проверка в корзине требует publishable API key витрины в конфигурации стенда.",
    action:
      "Попросите поддержку задать WOODRIGHT_STORE_PUBLISHABLE_KEY (или MEDUSA_PUBLISHABLE_KEY) на сервере Admin и перезапустить стенд. Ключ в интерфейс вводить не нужно.",
  },
  cart_verification_failed: {
    title: "Проверка в корзине не прошла",
    explanation: "Не удалось собрать тестовую корзину или применить код.",
    action: "Проверьте товар и код, затем повторите. Результат не подтверждён.",
  },
  promo_code_not_applied: {
    title: "Код не дал скидку",
    explanation: "Корзина собрана, но скидка по коду не появилась.",
    action: "Проверьте статус акции, её условия и состав тестовой корзины.",
  },
  unknown: {
    title: "Что-то пошло не так",
    explanation: "Мы не смогли выполнить действие.",
    action:
      "Повторите попытку. Если не поможет — откройте технические сведения и передайте их поддержке.",
  },
}

export type NormalizeAdminErrorInput = {
  httpStatus?: number
  endpoint?: string
  body?: unknown
  error?: unknown
  requestId?: string
  codeHint?: AdminErrorCode
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function extractRawMessage(body: unknown, error: unknown): string | undefined {
  const rec = asRecord(body)
  if (rec) {
    for (const key of ["message", "error", "detail", "title"] as const) {
      const v = rec[key]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 500)
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error.trim()
  return undefined
}

function extractServerCode(body: unknown): string | undefined {
  const rec = asRecord(body)
  const code = rec?.code ?? rec?.type ?? rec?.error_code
  return typeof code === "string" ? code : undefined
}

function mapFromHttpStatus(status?: number): AdminErrorCode | null {
  if (status === 401 || status === 403) return status === 401 ? "expired_session" : "forbidden"
  if (status === 404) return "deleted_entity"
  if (status === 408 || status === 504) return "timeout"
  if (status === 409) return "conflict"
  if (status === 413) return "oversized_file"
  if (status === 415) return "unsupported_file"
  if (status === 422) return "validation"
  if (status === 429) return "timeout"
  return null
}

function mapFromServerCode(code?: string): AdminErrorCode | null {
  if (!code) return null
  const c = code.toLowerCase()
  // Auth/session before generic "invalid*" — e.g. invalid_token must not become validation.
  if (
    c.includes("unauthorized") ||
    c.includes("unauthenticated") ||
    c.includes("auth") ||
    c.includes("token") ||
    c.includes("session") ||
    c.includes("jwt")
  ) {
    return "expired_session"
  }
  if (c.includes("forbidden") || c.includes("permission") || c.includes("not_allowed")) {
    return "forbidden"
  }
  if (c.includes("sku") && (c.includes("unique") || c.includes("duplicate") || c.includes("exists"))) {
    return "duplicate_sku"
  }
  if (c.includes("duplicate") && (c.includes("option") || c.includes("variant"))) {
    return "duplicate_option_combo"
  }
  if (c.includes("price") && c.includes("missing")) return "missing_price"
  if (c.includes("price_set") && (c.includes("missing") || c.includes("not_found"))) {
    return "missing_price_set"
  }
  if (c.includes("price") && c.includes("not_found")) return "price_not_found"
  if (c.includes("negative")) return "negative_amount"
  if (c.includes("rule") && c.includes("price")) return "rule_based_price_unsupported"
  if (c.includes("partial") && c.includes("bulk")) return "partial_bulk_failure"
  if (c.includes("invalid") && c.includes("price")) return "invalid_price"
  if (c.includes("publishable")) return "publishable_key_missing"
  if (
    (c.includes("promo") || c.includes("code")) &&
    (c.includes("duplicate") || c.includes("exists") || c.includes("unique"))
  ) {
    return "duplicate_promo_code"
  }
  if (c.includes("campaign") && (c.includes("budget") || c.includes("currency"))) {
    return "campaign_budget_conflict"
  }
  if (c.includes("currency")) return "invalid_currency"
  if (c.includes("inventory")) return "missing_inventory"
  if (
    c.includes("allocation") ||
    c.includes("target_type") ||
    c.includes("application_method_type") ||
    c.includes("buyget")
  ) {
    return "invalid_promotion_type"
  }
  if (c.includes("promotion") || c.includes("promo")) return "promotion_rule_error"
  if (c.includes("date")) return "invalid_date_range"
  if (c.includes("campaign")) return "campaign_constraint"
  if (c.includes("required")) return "required"
  if (c.includes("invalid") || c.includes("validation")) return "validation"
  return null
}

function mapFromRawMessage(raw?: string): AdminErrorCode | null {
  if (!raw) return null
  const m = raw.toLowerCase()
  if (m.includes("failed to fetch") || m.includes("networkerror")) return "network_error"
  if (m.includes("timeout") || m.includes("timed out")) return "timeout"
  if (m.includes("sku") && (m.includes("exist") || m.includes("unique") || m.includes("duplicate"))) {
    return "duplicate_sku"
  }
  if (m.includes("publishable")) return "publishable_key_missing"
  // Medusa 2.13.3: "Promotion with code: X, already exists."
  if (
    m.includes("promotion") &&
    m.includes("code") &&
    (m.includes("already exists") || m.includes("duplicate") || m.includes("unique"))
  ) {
    return "duplicate_promo_code"
  }
  if (
    m.includes("promotion") &&
    (m.includes("allocation") ||
      m.includes("max_quantity") ||
      m.includes("apply_to_quantity") ||
      m.includes("target_type"))
  ) {
    return "invalid_promotion_type"
  }
  if (
    m.includes("value") &&
    m.includes("percentage") &&
    (m.includes("100") || m.includes("between"))
  ) {
    return "invalid_promotion_value"
  }
  if (m.includes("campaign") && (m.includes("budget") || m.includes("currency"))) {
    return "campaign_budget_conflict"
  }
  if (m.includes("required")) return "required"
  if (m.includes("negative") || m.includes("must be greater") || m.includes(">= 0")) {
    return "negative_amount"
  }
  if (m.includes("price list") || m.includes("price_list") || m.includes("min_quantity") || m.includes("rules")) {
    return "rule_based_price_unsupported"
  }
  if (m.includes("price set") || m.includes("price_set")) return "missing_price_set"
  if (m.includes("invalid") && m.includes("price")) return "invalid_price"
  if (m.includes("price") && m.includes("not found")) return "price_not_found"
  if (m.includes("price") && m.includes("missing")) return "missing_price"
  return null
}

/**
 * Converts technical Admin/API failures into operator-facing Russian copy.
 * Raw details are preserved under `technical` for a collapsible drawer.
 */
export function normalizeAdminError(input: NormalizeAdminErrorInput): NormalizedAdminError {
  const rawMessage = extractRawMessage(input.body, input.error)
  const serverCode = extractServerCode(input.body)

  // Prefer HTTP auth statuses over ambiguous server codes like "invalid_token".
  const httpAuthCode = mapFromHttpStatus(input.httpStatus)
  const code: AdminErrorCode =
    input.codeHint ??
    (httpAuthCode === "expired_session" || httpAuthCode === "forbidden"
      ? httpAuthCode
      : null) ??
    mapFromServerCode(serverCode) ??
    mapFromRawMessage(rawMessage) ??
    httpAuthCode ??
    (input.error && /network|fetch/i.test(String((input.error as Error)?.message ?? input.error))
      ? "network_error"
      : "unknown")

  const entry = CATALOG[code]

  return {
    code,
    title: entry.title,
    explanation: entry.explanation,
    action: entry.action,
    technical: {
      httpStatus: input.httpStatus,
      endpoint: input.endpoint,
      errorCode: serverCode,
      requestId: input.requestId,
      rawMessage,
      timestamp: new Date().toISOString(),
    },
  }
}

export function formatAdminErrorPrimary(error: NormalizedAdminError): string {
  return `${error.title}. ${error.explanation} ${error.action}`
}
