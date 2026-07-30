/**
 * Buyer-facing legal page content.
 * Confirmed showroom/contact facts come from showroom-contacts.
 * Owner legal identity fields are never invented.
 */

import { showroomContacts } from "@/lib/showroom-contacts"
import {
  isLegalLaunchComplete,
  loadLegalOwnerValuesFromEnv,
  type LegalOwnerValues,
  missingRequiredLegalFields,
} from "@/lib/legal/owner-inputs"

export type LegalPageId =
  | "privacy"
  | "offer"
  | "delivery"
  | "payment"
  | "returns"
  | "warranty"

export type LegalPageSection = {
  heading: string
  paragraphs: string[]
}

export type LegalPageModel = {
  id: LegalPageId
  title: string
  path: string
  lead: string[]
  sections: LegalPageSection[]
  /** True when required owner fields for public launch are still missing. */
  incompleteForPublicLaunch: boolean
  missingFieldKeys: string[]
}

function confirmedShowroomLines(): string[] {
  return [
    `${showroomContacts.title}`,
    ...showroomContacts.addressLines,
    `${showroomContacts.freeCall.label}: ${showroomContacts.freeCall.display}`,
    `${showroomContacts.writeOrCall.label}: ${showroomContacts.writeOrCall.display}`,
  ]
}

function ownerBlock(
  values: LegalOwnerValues,
  keys: Array<keyof LegalOwnerValues>,
  labels: Record<string, string>
): string[] {
  const lines: string[] = []
  for (const k of keys) {
    const v = String(values[k] ?? "").trim()
    if (v) lines.push(`${labels[k as string] ?? k}: ${v}`)
  }
  return lines
}

/**
 * Build page model. In incomplete mode we still serve the route with confirmed
 * operational facts only - never TODO/PLACEHOLDER strings for buyers.
 */
export function buildLegalPage(
  id: LegalPageId,
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): LegalPageModel {
  const incomplete = !isLegalLaunchComplete(values)
  const missing = missingRequiredLegalFields(values)
  const showroom = confirmedShowroomLines()

  const identityLines = ownerBlock(
    values,
    [
      "legal_entity_name",
      "inn",
      "ogrn_or_ogrnip",
      "legal_address",
      "personal_data_operator_name",
    ],
    {
      legal_entity_name: "Продавец",
      inn: "ИНН",
      ogrn_or_ogrnip: "ОГРН / ОГРНИП",
      legal_address: "Юридический адрес",
      personal_data_operator_name: "Оператор персональных данных",
    }
  )

  const base = {
    incompleteForPublicLaunch: incomplete,
    missingFieldKeys: missing,
  }

  switch (id) {
    case "privacy":
      return {
        ...base,
        id,
        title: incomplete
          ? "Конфиденциальность - подготовка"
          : "Политика конфиденциальности",
        path: "/privacy",
        lead: [
          incomplete
            ? "Как связаться с нами по вопросам данных - полный текст политики появится после утверждения владельцем"
            : "Как Woodright обрабатывает персональные данные при заявках и заказах",
        ],
        sections: [
          {
            heading: "Контакты для обращений",
            paragraphs: [
              ...showroom,
              ...(values.privacy_email
                ? [`Email: ${values.privacy_email}`]
                : []),
              ...(values.privacy_phone
                ? [`Телефон: ${values.privacy_phone}`]
                : []),
            ],
          },
          {
            heading: "Оператор",
            paragraphs:
              identityLines.length > 0
                ? identityLines
                : [
                    "Контакты шоурума для обращений указаны выше",
                    "Юридические реквизиты оператора появятся на этой странице после утверждения владельцем - до этого момента страница не является полной политикой ПДн",
                  ],
          },
          {
            heading: "Какие данные мы получаем",
            paragraphs: [
              "Имя, телефон и комментарий, которые вы оставляете в заявке или при оформлении заказа",
              "Технические сведения, нужные для работы сайта и защиты от злоупотреблений",
            ],
          },
          {
            heading: "Зачем обрабатываем",
            paragraphs: [
              "Чтобы связаться с вами по заказу или заявке",
              "Чтобы подготовить расчёт, доставку и оплату по согласованному сценарию",
              "Чтобы исполнять договорённости и отвечать на обращения",
            ],
          },
          ...(values.personal_data_processing_rules
            ? [
                {
                  heading: "Правила обработки",
                  paragraphs: [values.personal_data_processing_rules],
                },
              ]
            : []),
        ],
      }
    case "offer":
      return {
        ...base,
        id,
        title: incomplete ? "Оферта - черновик для подготовки" : "Публичная оферта",
        path: "/offer",
        lead: incomplete
          ? ["Подготовка условий продажи - полный текст оферты появится после утверждения владельцем"]
          : ["Условия продажи мебели Woodright"],
        sections: [
          {
            heading: "Продавец",
            paragraphs:
              identityLines.length > 0
                ? identityLines
                : ["Связь по заказам - через шоурум Woodright (контакты ниже)"],
          },
          {
            heading: "Предмет",
            paragraphs: [
              "Готовая и заказная мебель из массива, комнатные решения и сопутствующие услуги по согласованию",
            ],
          },
          ...(values.offer_acceptance_moment
            ? [
                {
                  heading: "Акцепт",
                  paragraphs: [values.offer_acceptance_moment],
                },
              ]
            : []),
          {
            heading: "Связь",
            paragraphs: [
              ...showroom,
              ...(values.dispute_contact_process
                ? [values.dispute_contact_process]
                : []),
            ],
          },
        ],
      }
    case "delivery":
      return {
        ...base,
        id,
        title: "Доставка",
        path: "/delivery",
        lead: ["Как организуем доставку и самовывоз"],
        sections: [
          {
            heading: "Шоурум",
            paragraphs: [
              ...showroom,
              "Самовывоз и примерка - через шоурум по записи",
            ],
          },
          {
            heading: "Условия доставки",
            paragraphs: values.delivery_regions_and_terms
              ? [values.delivery_regions_and_terms]
              : [
                  "Регионы, сроки и стоимость доставки менеджер подтверждает после согласования состава заказа",
                ],
          },
        ],
      }
    case "payment":
      return {
        ...base,
        id,
        title: "Оплата",
        path: "/payment",
        lead: ["Как проходит оплата заказа Woodright"],
        sections: [
          {
            heading: "Стартовый режим",
            paragraphs: [
              "На запуске онлайн-эквайринг на сайте не активирован",
              "После оформления заказа менеджер подтверждает состав и присылает ссылку на оплату (PaymentLink)",
              "Статусы для покупателя: «Ожидает оплаты», «Оплата отмечена менеджером», «Оплата подтверждена»",
            ],
          },
          ...(values.payment_methods_terms
            ? [
                {
                  heading: "Утверждённые условия",
                  paragraphs: [values.payment_methods_terms],
                },
              ]
            : []),
        ],
      }
    case "returns":
      return {
        ...base,
        id,
        title: incomplete ? "Возврат - подготовка" : "Возврат",
        path: "/returns",
        lead: ["Как обсудить возврат или обмен"],
        sections: [
          {
            heading: "Как связаться",
            paragraphs: showroom,
          },
          ...(values.return_terms
            ? [{ heading: "Условия", paragraphs: [values.return_terms] }]
            : []),
        ],
      }
    case "warranty":
      return {
        ...base,
        id,
        title: incomplete ? "Гарантия - подготовка" : "Гарантия",
        path: "/warranty",
        lead: ["Гарантийные обязательства Woodright"],
        sections: [
          {
            heading: "Как связаться",
            paragraphs: showroom,
          },
          ...(values.warranty_terms
            ? [{ heading: "Условия", paragraphs: [values.warranty_terms] }]
            : []),
        ],
      }
  }
}

export const LEGAL_PAGE_IDS: LegalPageId[] = [
  "privacy",
  "offer",
  "delivery",
  "payment",
  "returns",
  "warranty",
]

export const LEGAL_PAGE_PATHS: Record<LegalPageId, string> = {
  privacy: "/privacy",
  offer: "/offer",
  delivery: "/delivery",
  payment: "/payment",
  returns: "/returns",
  warranty: "/warranty",
}
