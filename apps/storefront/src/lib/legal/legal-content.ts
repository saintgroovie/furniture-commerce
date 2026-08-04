/**
 * Buyer-facing legal page content (central SoT).
 *
 * Confirmed showroom/contact facts: `@/lib/showroom-contacts`.
 * Seller identity / commercial clauses: `@/lib/legal/owner-inputs` (env only).
 * Never invent INN, OGRN, legal entity, return windows, or warranty periods.
 */

import { showroomContacts } from "@/lib/showroom-contacts"
import { checkoutCopy } from "@/lib/woodright-copy"
import {
  isLegalLaunchComplete,
  loadLegalOwnerValuesFromEnv,
  type LegalOwnerValues,
  missingRequiredLegalFields,
} from "@/lib/legal/owner-inputs"
import {
  LEGAL_DOCUMENT_META,
  type LegalDocumentMeta,
} from "@/lib/legal/legal-status"

export type LegalPageId =
  | "privacy"
  | "personal-data"
  | "cookies"
  | "terms"
  | "offer"
  | "delivery"
  | "payment"
  | "returns"
  | "warranty"
  | "requisites"

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
  document: LegalDocumentMeta
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

function versionFooter(meta: LegalDocumentMeta): LegalPageSection {
  return {
    heading: "Версия документа",
    paragraphs: [
      `Версия ${meta.version}`,
      `Дата ${meta.effectiveDate}`,
      meta.status === "approved"
        ? "Статус: утверждено владельцем"
        : meta.status === "owner_review"
          ? "Статус: на проверке у владельца - не является финальным юридическим заключением"
          : "Статус: черновик для внутренней подготовки",
    ],
  }
}

/**
 * Build page model from confirmed facts + optional owner env.
 * Titles never use «подготовка» / buyer «черновик» chrome.
 */
export function buildLegalPage(
  id: LegalPageId,
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv(),
  meta: LegalDocumentMeta = LEGAL_DOCUMENT_META
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
    document: meta,
  }

  switch (id) {
    case "privacy":
      return {
        ...base,
        id,
        title: "Политика конфиденциальности",
        path: "/privacy",
        lead: [
          "Как Woodright обрабатывает персональные данные при заявках и заказах",
        ],
        sections: [
          {
            heading: "Кто обрабатывает данные",
            paragraphs:
              identityLines.length > 0
                ? identityLines
                : [
                    "Оператор персональных данных и юридические реквизиты продавца появятся здесь после подтверждения владельцем",
                    "До этого момента обращайтесь по контактам шоурума ниже",
                  ],
          },
          {
            heading: "Какие данные получаем",
            paragraphs: [
              "Имя, телефон и комментарий из заявки или оформления заказа",
              "Адрес доставки, если вы его указали при оформлении",
              "Технические сведения, нужные для работы сайта и защиты от злоупотреблений",
            ],
          },
          {
            heading: "Цели обработки",
            paragraphs: [
              "Связаться с вами по заказу или заявке",
              "Подготовить расчёт, доставку и оплату по согласованному сценарию",
              "Исполнять договорённости и отвечать на обращения",
            ],
          },
          {
            heading: "Cookies и похожие технологии",
            paragraphs: [
              "Подробности - на странице Cookies",
              "Ссылка: /cookies",
            ],
          },
          {
            heading: "Как обратиться",
            paragraphs: [
              ...showroom,
              ...(values.privacy_email ? [`Email: ${values.privacy_email}`] : []),
              ...(values.privacy_phone ? [`Телефон: ${values.privacy_phone}`] : []),
              ...(values.dispute_contact_process
                ? [values.dispute_contact_process]
                : []),
            ],
          },
          ...(values.personal_data_processing_rules
            ? [
                {
                  heading: "Утверждённые правила обработки",
                  paragraphs: [values.personal_data_processing_rules],
                },
              ]
            : []),
          versionFooter(meta),
        ],
      }

    case "personal-data":
      return {
        ...base,
        id,
        title: "Персональные данные",
        path: "/personal-data",
        lead: [
          "Согласие на обработку данных при заявках и оформлении заказа",
        ],
        sections: [
          {
            heading: "Когда действует это согласие",
            paragraphs: [
              "Заявка по проекту (/bespoke/request)",
              "Оформление заказа из корзины (/checkout)",
              "Обращения через контакты шоурума, если вы сами передаёте данные",
            ],
          },
          {
            heading: "Какие данные вы передаёте",
            paragraphs: [
              "Имя и телефон",
              "Email и адрес доставки - если заполняете соответствующие поля",
              "Текст комментария или описания задачи",
            ],
          },
          {
            heading: "Зачем нужны данные",
            paragraphs: [
              "Чтобы ответить на заявку или подтвердить заказ",
              "Мы используем контакты для ответа по заявке или заказу",
              "Отдельные маркетинговые рассылки в buyer-коде storefront не подключены - любые иные каналы должны подтвердить владелец",
            ],
          },
          {
            heading: "Документы",
            paragraphs: [
              "Политика конфиденциальности: /privacy",
              "Cookies: /cookies",
              "Оферта: /offer",
            ],
          },
          {
            heading: "Контакты",
            paragraphs: showroom,
          },
          versionFooter(meta),
        ],
      }

    case "cookies":
      return {
        ...base,
        id,
        title: "Cookies",
        path: "/cookies",
        lead: [
          "Какие cookies и хранилища использует сайт Woodright",
        ],
        sections: [
          {
            heading: "Что используем на сайте покупателя",
            paragraphs: [
              "Cookie корзины `cart_id` - чтобы сохранить состав заказа между визитами",
              "Параметры: path=/, SameSite=Lax, Secure на HTTPS, срок около 30 дней",
              "Session storage для служебной передачи токена отслеживания заказа - не для маркетинга",
            ],
          },
          {
            heading: "Чего нет на buyer-сайте",
            paragraphs: [
              "Отдельного стороннего analytics provider в коде storefront не подключено",
              "Рекламные пиксели и маркетинговые cookies в buyer-коде не заявлены",
            ],
          },
          {
            heading: "Управление",
            paragraphs: [
              "Вы можете удалить cookies в настройках браузера",
              "Без cookie корзины состав заказа не сохранится между сеансами",
            ],
          },
          {
            heading: "Связанные документы",
            paragraphs: [
              "Политика конфиденциальности: /privacy",
              "Персональные данные: /personal-data",
            ],
          },
          versionFooter(meta),
        ],
      }

    case "terms":
      return {
        ...base,
        id,
        title: "Условия пользования сайтом",
        path: "/terms",
        lead: [
          "Правила использования сайта Woodright",
          "Условия продажи - в оферте",
        ],
        sections: [
          {
            heading: "Сайт",
            paragraphs: [
              "Сайт показывает каталог мебели Woodright и принимает заявки и заказы",
              "Материалы сайта (тексты, фото, графика) принадлежат правообладателю и не копируются без согласия",
            ],
          },
          {
            heading: "Как проходит оформление",
            paragraphs: [...checkoutCopy.paymentClarity],
          },
          {
            heading: "Документы продажи",
            paragraphs: [
              "Публичная оферта: /offer",
              "Доставка: /delivery",
              "Оплата: /payment",
              "Возврат: /returns",
              "Гарантия: /warranty",
              "Политика конфиденциальности: /privacy",
              "Cookies: /cookies",
            ],
          },
          {
            heading: "Связь",
            paragraphs: showroom,
          },
          versionFooter(meta),
        ],
      }

    case "offer":
      return {
        ...base,
        id,
        title: "Публичная оферта",
        path: "/offer",
        lead: [
          "Условия продажи мебели Woodright для согласования с владельцем",
        ],
        sections: [
          {
            heading: "Продавец",
            paragraphs:
              identityLines.length > 0
                ? identityLines
                : [
                    "Полные реквизиты продавца появятся после подтверждения владельцем",
                    "До этого связь по заказам - через шоурум Woodright",
                  ],
          },
          {
            heading: "Предмет",
            paragraphs: [
              "Готовая и заказная мебель из массива, комнатные решения и сопутствующие услуги по согласованию",
            ],
          },
          {
            heading: "Оформление и подтверждение",
            paragraphs: [
              ...checkoutCopy.paymentClarity,
              ...(values.offer_acceptance_moment
                ? [values.offer_acceptance_moment]
                : [
                    "Момент акцепта оферты владелец подтвердит отдельно перед утверждением текста",
                  ]),
            ],
          },
          {
            heading: "Цена и оплата",
            paragraphs: [
              "Цена фиксируется при подтверждении состава заказа менеджером",
              "На запуске онлайн-эквайринг на сайте не активирован",
              "После подтверждения менеджер присылает ссылку или счёт на оплату (manual invoice / PaymentLink)",
              "Финальный режим оплаты - отдельное решение владельца и не считается утверждённым этим текстом",
              ...(values.payment_methods_terms
                ? [values.payment_methods_terms]
                : []),
            ],
          },
          {
            heading: "Доставка, приёмка, возврат, гарантия",
            paragraphs: [
              "Доставка: /delivery",
              "Возврат: /returns",
              "Гарантия: /warranty",
              "Конкретные сроки и исключения - только после утверждения владельцем, без вымышленных цифр",
            ],
          },
          {
            heading: "Индивидуальные изделия",
            paragraphs: [
              "Позиции по проекту оформляются через заявку",
              "Условия производства и изменений согласуются с менеджером до старта работ",
            ],
          },
          {
            heading: "Связь и претензии",
            paragraphs: [
              ...showroom,
              ...(values.dispute_contact_process
                ? [values.dispute_contact_process]
                : []),
            ],
          },
          versionFooter(meta),
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
            heading: "Шоурум и самовывоз",
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
                  "Регионы, сроки, стоимость, подъём и сборку менеджер подтверждает после согласования состава заказа",
                  "На этой странице нет вымышленных сроков или тарифов",
                ],
          },
          {
            heading: "Повреждения и приёмка",
            paragraphs: [
              "При получении проверьте комплектацию и внешний вид",
              "Замечания фиксируйте с менеджером по контактам шоурума",
            ],
          },
          versionFooter(meta),
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
            heading: "Текущий режим",
            paragraphs: [
              "На сайте нет онлайн-оплаты картой",
              "Режим: manual invoice / PaymentLink после подтверждения менеджером",
              "После оформления менеджер подтверждает состав и присылает ссылку или счёт на оплату",
              "Статусы для покупателя: «Ожидает оплаты», «Оплата отмечена менеджером», «Оплата подтверждена»",
            ],
          },
          {
            heading: "Решение владельца",
            paragraphs: [
              "Остаётся ли manual invoice основным способом - отдельное owner decision",
              "Этот текст не утверждает запуск онлайн-эквайринга",
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
          versionFooter(meta),
        ],
      }

    case "returns":
      return {
        ...base,
        id,
        title: "Возврат",
        path: "/returns",
        lead: ["Как обсудить возврат или обмен"],
        sections: [
          {
            heading: "Как связаться",
            paragraphs: showroom,
          },
          {
            heading: "Условия",
            paragraphs: values.return_terms
              ? [values.return_terms]
              : [
                  "Сроки возврата, исключения для индивидуальных изделий и расходы на обратную доставку утверждает владелец",
                  "До утверждения обсуждайте конкретный случай с менеджером по контактам выше",
                  "На странице нет вымышленных сроков возврата",
                ],
          },
          versionFooter(meta),
        ],
      }

    case "warranty":
      return {
        ...base,
        id,
        title: "Гарантия",
        path: "/warranty",
        lead: ["Гарантийные обращения Woodright"],
        sections: [
          {
            heading: "Как связаться",
            paragraphs: showroom,
          },
          {
            heading: "Условия",
            paragraphs: values.warranty_terms
              ? [values.warranty_terms]
              : [
                  "Срок и объём гарантии утверждает владелец по товарной политике",
                  "До утверждения опишите ситуацию менеджеру - без вымышленных гарантийных сроков на сайте",
                ],
          },
          versionFooter(meta),
        ],
      }

    case "requisites":
      return {
        ...base,
        id,
        title: "Реквизиты",
        path: "/requisites",
        lead: ["Реквизиты продавца Woodright"],
        sections: [
          {
            heading: "Продавец",
            paragraphs:
              identityLines.length > 0
                ? identityLines
                : [
                    "Юридическое наименование, ИНН, ОГРН и юридический адрес появятся после подтверждения владельцем",
                    "Публикация банковских реквизитов - только с отдельного разрешения владельца",
                  ],
          },
          {
            heading: "Контакты",
            paragraphs: showroom,
          },
          versionFooter(meta),
        ],
      }
  }
}

export const LEGAL_PAGE_IDS: LegalPageId[] = [
  "privacy",
  "personal-data",
  "cookies",
  "terms",
  "offer",
  "delivery",
  "payment",
  "returns",
  "warranty",
  "requisites",
]

export const LEGAL_PAGE_PATHS: Record<LegalPageId, string> = {
  privacy: "/privacy",
  "personal-data": "/personal-data",
  cookies: "/cookies",
  terms: "/terms",
  offer: "/offer",
  delivery: "/delivery",
  payment: "/payment",
  returns: "/returns",
  warranty: "/warranty",
  requisites: "/requisites",
}
