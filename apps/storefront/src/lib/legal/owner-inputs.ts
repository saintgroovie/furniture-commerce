/**
 * Owner-supplied legal / commercial fields for Woodright buyer legal pages.
 *
 * Confirmed OD-01 identity is baked from `@/lib/legal/woodright-seller`.
 * Confirmed commercial models (OD-02/03/04/05/10 + 2026-08-20 closures)
 * fill the remaining required fields. Env WOODRIGHT_LEGAL_* may override.
 *
 * Do not invent privacy email, bank details, tariffs, or a claims SLA.
 */

import { showroomContacts } from "@/lib/showroom-contacts"
import { woodrightSeller } from "@/lib/legal/woodright-seller"

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

/** Schema. Values: confirmed SoT defaults, then optional env override. */
export const LEGAL_OWNER_FIELD_META: LegalOwnerFieldMeta[] = [
  {
    key: "legal_entity_name",
    labelRu: "Юридическое наименование",
    whyRequired: "Оферта и политика ПДн требуют идентификации продавца",
    whereDisplayed: "/offer, /privacy, /requisites",
    exampleFormat: "ООО «…» или ИП Фамилия И.О.",
    requiredForPublicLaunch: true,
  },
  {
    key: "inn",
    labelRu: "ИНН",
    whyRequired: "Идентификация продавца в оферте и реквизитах",
    whereDisplayed: "/offer, /privacy, /requisites",
    exampleFormat: "10 или 12 цифр",
    requiredForPublicLaunch: true,
  },
  {
    key: "ogrn_or_ogrnip",
    labelRu: "ОГРН / ОГРНИП",
    whyRequired: "Государственная регистрация продавца",
    whereDisplayed: "/offer, /requisites",
    exampleFormat: "ОГРН 13 цифр или ОГРНИП 15 цифр",
    requiredForPublicLaunch: true,
  },
  {
    key: "legal_address",
    labelRu: "Юридический адрес",
    whyRequired: "Реквизиты продавца в оферте",
    whereDisplayed: "/offer, /privacy, /requisites",
    exampleFormat: "индекс, город, улица, дом",
    requiredForPublicLaunch: true,
  },
  {
    key: "privacy_email",
    labelRu: "Email для запросов по ПДн",
    whyRequired: "Optional written channel; not unique 152-FZ requirement if postal + phone published",
    whereDisplayed: "/privacy",
    exampleFormat: "privacy@woodright.ru",
    requiredForPublicLaunch: false,
  },
  {
    key: "privacy_phone",
    labelRu: "Телефон для запросов по ПДн",
    whyRequired: "Канал обращений субъекта персональных данных",
    whereDisplayed: "/privacy",
    exampleFormat: "+7 …",
    requiredForPublicLaunch: true,
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
    labelRu: "Правила обработки ПДн",
    whyRequired: "Политика не может быть пустой при сборе контактов в checkout",
    whereDisplayed: "/privacy",
    exampleFormat: "утверждённый текст",
    requiredForPublicLaunch: true,
  },
  {
    key: "delivery_regions_and_terms",
    labelRu: "Условия доставки",
    whyRequired: "Buyer page /delivery и оферта",
    whereDisplayed: "/delivery, /offer",
    exampleFormat: "quote-only; no invented geography",
    requiredForPublicLaunch: true,
  },
  {
    key: "payment_methods_terms",
    labelRu: "Способы и условия оплаты",
    whyRequired: "Страница /payment и честный checkout copy",
    whereDisplayed: "/payment, checkout",
    exampleFormat: "PaymentLink / invoice after manager",
    requiredForPublicLaunch: true,
  },
  {
    key: "return_terms",
    labelRu: "Условия возврата",
    whyRequired: "Страница /returns",
    whereDisplayed: "/returns, /offer",
    exampleFormat: "manager-assisted + statutory baseline",
    requiredForPublicLaunch: true,
  },
  {
    key: "warranty_terms",
    labelRu: "Условия гарантии",
    whyRequired: "Страница /warranty",
    whereDisplayed: "/warranty",
    exampleFormat: "12 месяцев с момента передачи, продавец",
    requiredForPublicLaunch: true,
  },
  {
    key: "offer_acceptance_moment",
    labelRu: "Статус отправки заказа",
    whyRequired: "Страница условий продажи не должна называть submit акцептом",
    whereDisplayed: "/offer, checkout",
    exampleFormat: "submit = request; exact acceptance = LEGAL REVIEW",
    requiredForPublicLaunch: true,
  },
  {
    key: "dispute_contact_process",
    labelRu: "Порядок претензий и связи",
    whyRequired: "Оферта / privacy / returns",
    whereDisplayed: "/offer, /returns, /privacy",
    exampleFormat: "канал без выдуманного SLA",
    requiredForPublicLaunch: true,
  },
]

export type LegalOwnerValues = Partial<Record<LegalOwnerFieldKey, string>>

const SHOWROOM_PHONES = `${showroomContacts.freeCall.display}, ${showroomContacts.writeOrCall.display}`

/**
 * Confirmed launch defaults. Not env invention: OD-01…05/10 + 2026-08-20 closures.
 * privacy_email intentionally omitted.
 * offer_acceptance_moment intentionally omitted: submit≠acceptance is published
 * in page copy, but the exact civil-law moment stays LEGAL REVIEW and must not
 * make isLegalLaunchComplete() true.
 */
export const CONFIRMED_LEGAL_DEFAULTS: LegalOwnerValues = {
  legal_entity_name: woodrightSeller.shortName,
  inn: woodrightSeller.inn,
  ogrn_or_ogrnip: woodrightSeller.ogrn,
  legal_address: woodrightSeller.legalAddress,
  privacy_phone: SHOWROOM_PHONES,
  personal_data_operator_name: woodrightSeller.fullName,
  personal_data_processing_rules:
    "Оператор обрабатывает имя, телефон, email и комментарий из заявок и заказов, а также cookie cart_id, чтобы связаться с вами и подтвердить заказ. Полный текст: страница /privacy",
  delivery_regions_and_terms:
    "Стоимость и условия доставки зависят от адреса и состава заказа. После оформления менеджер проверит детали и согласует условия до оплаты. Публичного тарифа нет",
  payment_methods_terms:
    "Оплачивать заказ сразу на сайте не нужно. После оформления менеджер проверит детали и отправит ссылку на оплату или счёт",
  return_terms:
    "Если нужно вернуть товар или вы обнаружили недостаток, свяжитесь с менеджером Woodright. Уточним обстоятельства покупки. Условия зависят от ситуации и применимого закона. Отдельного коммерческого SLA нет",
  warranty_terms:
    "Гарантийный срок - 12 месяцев с момента передачи товара покупателю. Гарантию предоставляет продавец ООО «Роэл-Техник». Обязательные права при недостатках сохраняются",
  dispute_contact_process:
    `Обращение: ${SHOWROOM_PHONES} или мессенджеры на странице /contacts. Рассмотрим обращение в сроки, предусмотренные законом. Отдельного сервисного SLA Woodright не публикует`,
}

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
  const out: LegalOwnerValues = { ...CONFIRMED_LEGAL_DEFAULTS }
  for (const [k, v] of Object.entries(map) as [LegalOwnerFieldKey, string | undefined][]) {
    const t = String(v ?? "").trim()
    if (t && fieldIsProvided(k, t)) out[k] = t
  }
  return out
}

const UNUSABLE_LEGAL_FIELD = /LEGAL REVIEW|правовая оценка|TBD|\bTODO\b|PLACEHOLDER/i

function fieldIsProvided(key: LegalOwnerFieldKey, value: string | undefined): boolean {
  const t = String(value ?? "").trim()
  if (!t) return false
  if (key === "offer_acceptance_moment" && UNUSABLE_LEGAL_FIELD.test(t)) return false
  return true
}

export function missingRequiredLegalFields(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): LegalOwnerFieldKey[] {
  return LEGAL_OWNER_FIELD_META.filter((f) => f.requiredForPublicLaunch)
    .map((f) => f.key)
    .filter((k) => !fieldIsProvided(k, values[k]))
}

/**
 * Fail-closed. Filled commercial copy is not owner legal-pack approval.
 * Token must be the explicit owner string; this module never sets it.
 */
export function isLegalLaunchComplete(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv(),
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (missingRequiredLegalFields(values).length > 0) return false
  return String(env.WOODRIGHT_LEGAL_PACK_TOKEN ?? "").trim() === "OWNER_LEGAL_CONTENT_APPROVED"
}

export function legalOwnerInputPacket(
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): Array<LegalOwnerFieldMeta & { ownerProvided: boolean; blocking: boolean }> {
  return LEGAL_OWNER_FIELD_META.map((f) => ({
    ...f,
    ownerProvided: fieldIsProvided(f.key, values[f.key]),
    blocking: f.requiredForPublicLaunch && !fieldIsProvided(f.key, values[f.key]),
  }))
}
