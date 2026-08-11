/**
 * Owner-supplied legal / commercial fields for Woodright buyer legal pages.
 *
 * Do NOT invent values. Leave unset until the owner provides them.
 * Launch readiness fails closed while required fields are missing.
 */

export type LegalOwnerFieldKey =
  | "legal_entity_name"
  | "inn"
  | "ogrn_or_ogrnip"
  | "legal_address"
  | "privacy_email"
  | "privacy_phone"
  | "personal_data_operator_name"
  | "personal_data_processing_rules"
  | "delivery_regions_and_terms"
  | "payment_methods_terms"
  | "return_terms"
  | "warranty_terms"
  | "offer_acceptance_moment"
  | "dispute_contact_process"

export type LegalOwnerFieldMeta = {
  key: LegalOwnerFieldKey
  labelRu: string
  whyRequired: string
  whereDisplayed: string
  exampleFormat: string
  requiredForPublicLaunch: boolean
}

/** Schema only - values come from env / future sealed owner file (never invent). */
export const LEGAL_OWNER_FIELD_META: LegalOwnerFieldMeta[] = [
  {
    key: "legal_entity_name",
    labelRu: "Юридическое наименование",
    whyRequired: "Оферта и политика ПДн требуют идентификации продавца",
    whereDisplayed: "/offer, /privacy, footer legal block",
    exampleFormat: "ООО «…» или ИП Фамилия И.О.",
    requiredForPublicLaunch: true,
  },
  {
    key: "inn",
    labelRu: "ИНН",
    whyRequired: "Идентификация продавца в оферте и реквизитах",
    whereDisplayed: "/offer, /privacy",
    exampleFormat: "10 или 12 цифр",
    requiredForPublicLaunch: true,
  },
  {
    key: "ogrn_or_ogrnip",
    labelRu: "ОГРН / ОГРНИП",
    whyRequired: "Государственная регистрация продавца",
    whereDisplayed: "/offer",
    exampleFormat: "ОГРН 13 цифр или ОГРНИП 15 цифр",
    requiredForPublicLaunch: true,
  },
  {
    key: "legal_address",
    labelRu: "Юридический адрес",
    whyRequired: "Реквизиты продавца в оферте",
    whereDisplayed: "/offer, /privacy",
    exampleFormat: "индекс, город, улица, дом",
    requiredForPublicLaunch: true,
  },
  {
    key: "privacy_email",
    labelRu: "Email для запросов по ПДн",
    whyRequired: "Канал обращений субъекта персональных данных",
    whereDisplayed: "/privacy, /contacts cross-link",
    exampleFormat: "privacy@woodright.ru",
    requiredForPublicLaunch: true,
  },
  {
    key: "privacy_phone",
    labelRu: "Телефон для запросов по ПДн",
    whyRequired: "Альтернативный канал обращений по ПДн",
    whereDisplayed: "/privacy",
    exampleFormat: "+7 …",
    requiredForPublicLaunch: false,
  },
  {
    key: "personal_data_operator_name",
    labelRu: "Оператор персональных данных",
    whyRequired: "Политика ПДн должна назвать оператора",
    whereDisplayed: "/privacy",
    exampleFormat: "совпадает с юр. наименованием или отдельно",
    requiredForPublicLaunch: true,
  },
  {
    key: "personal_data_processing_rules",
    labelRu: "Правила обработки ПДн (утверждённый текст)",
    whyRequired: "Политика не может быть пустой при сборе контактов в checkout",
    whereDisplayed: "/privacy",
    exampleFormat: "утверждённый owner markdown/text",
    requiredForPublicLaunch: true,
  },
  {
    key: "delivery_regions_and_terms",
    labelRu: "Регионы и условия доставки",
    whyRequired: "Buyer page /delivery и оферта",
    whereDisplayed: "/delivery, /offer",
    exampleFormat: "регионы, сроки-ориентиры, самовывоз шоурум",
    requiredForPublicLaunch: true,
  },
  {
    key: "payment_methods_terms",
    labelRu: "Способы и условия оплаты",
    whyRequired: "Страница /payment и честный checkout copy",
    whereDisplayed: "/payment, checkout",
    exampleFormat: "PaymentLink менеджера / без онлайн-PSP на старте",
    requiredForPublicLaunch: true,
  },
  {
    key: "return_terms",
    labelRu: "Условия возврата",
    whyRequired: "Страница /returns",
    whereDisplayed: "/returns, /offer",
    exampleFormat: "сроки и порядок, утверждённые владельцем",
    requiredForPublicLaunch: true,
  },
  {
    key: "warranty_terms",
    labelRu: "Условия гарантии",
    whyRequired: "Страница /warranty",
    whereDisplayed: "/warranty",
    exampleFormat: "срок и объём, утверждённые владельцем",
    requiredForPublicLaunch: true,
  },
  {
    key: "offer_acceptance_moment",
    labelRu: "Момент акцепта оферты",
    whyRequired: "Публичная оферта должна фиксировать акцепт",
    whereDisplayed: "/offer, checkout",
    exampleFormat: "например: оформление заказа / оплата по ссылке",
    requiredForPublicLaunch: true,
  },
  {
    key: "dispute_contact_process",
    labelRu: "Порядок претензий и связи",
    whyRequired: "Оферта / privacy / returns",
    whereDisplayed: "/offer, /returns, /privacy",
    exampleFormat: "канал + срок ответа",
    requiredForPublicLaunch: true,
  },
]

export type LegalOwnerValues = Partial<Record<LegalOwnerFieldKey, string>>

/**
 * Load owner values from env prefix WOODRIGHT_LEGAL_* (optional).
 * Never invent defaults for required legal identity fields.
 */
export function loadLegalOwnerValuesFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LegalOwnerValues {
  const map: Record<LegalOwnerFieldKey, string | undefined> = {
    legal_entity_name: env.WOODRIGHT_LEGAL_ENTITY_NAME,
    inn: env.WOODRIGHT_LEGAL_INN,
    ogrn_or_ogrnip: env.WOODRIGHT_LEGAL_OGRN,
    legal_address: env.WOODRIGHT_LEGAL_ADDRESS,
    privacy_email: env.WOODRIGHT_LEGAL_PRIVACY_EMAIL,
    privacy_phone: env.WOODRIGHT_LEGAL_PRIVACY_PHONE,
    personal_data_operator_name: env.WOODRIGHT_LEGAL_PD_OPERATOR,
    personal_data_processing_rules: env.WOODRIGHT_LEGAL_PD_RULES,
    delivery_regions_and_terms: env.WOODRIGHT_LEGAL_DELIVERY_TERMS,
    payment_methods_terms: env.WOODRIGHT_LEGAL_PAYMENT_TERMS,
    return_terms: env.WOODRIGHT_LEGAL_RETURN_TERMS,
    warranty_terms: env.WOODRIGHT_LEGAL_WARRANTY_TERMS,
    offer_acceptance_moment: env.WOODRIGHT_LEGAL_OFFER_ACCEPTANCE,
    dispute_contact_process: env.WOODRIGHT_LEGAL_DISPUTE_PROCESS,
  }
  const out: LegalOwnerValues = {}
  for (const [k, v] of Object.entries(map) as [LegalOwnerFieldKey, string | undefined][]) {
    const t = String(v ?? "").trim()
    if (t) out[k] = t
  }
  return out
}

export function missingRequiredLegalFields(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): LegalOwnerFieldKey[] {
  return LEGAL_OWNER_FIELD_META.filter((f) => f.requiredForPublicLaunch)
    .map((f) => f.key)
    .filter((k) => !String(values[k] ?? "").trim())
}

export function isLegalLaunchComplete(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): boolean {
  return missingRequiredLegalFields(values).length === 0
}

export function legalOwnerInputPacket(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): Array<LegalOwnerFieldMeta & { ownerProvided: boolean; blocking: boolean }> {
  return LEGAL_OWNER_FIELD_META.map((f) => ({
    ...f,
    ownerProvided: Boolean(String(values[f.key] ?? "").trim()),
    blocking: f.requiredForPublicLaunch && !String(values[f.key] ?? "").trim(),
  }))
}
