/**
 * Buyer-facing legal / information page content.
 *
 * Identity: `@/lib/legal/woodright-seller` (OD-01).
 * Contacts: `@/lib/showroom-contacts`.
 * Commercial models: OD-02/03/04/05/10 + 2026-08-20 closures.
 * Bank details are never interpolated here (OD-10 = B).
 */

import { showroomContacts } from "@/lib/showroom-contacts"
import { checkoutCopy } from "@/lib/woodright-copy"
import { woodrightSeller } from "@/lib/legal/woodright-seller"
import {
  isLegalLaunchComplete,
  loadLegalOwnerValuesFromEnv,
  type LegalOwnerValues,
  missingRequiredLegalFields,
} from "@/lib/legal/owner-inputs"

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
  related?: { label: string; href: string }[]
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

function sellerIdentityLines(): string[] {
  return [
    `Продавец: ${woodrightSeller.fullName}`,
    `Краткое наименование: ${woodrightSeller.shortName}`,
    `ОГРН: ${woodrightSeller.ogrn}`,
    `ИНН: ${woodrightSeller.inn}`,
    `КПП: ${woodrightSeller.kpp}`,
    `Юридический адрес: ${woodrightSeller.legalAddress}`,
  ]
}

const RELATED: Record<LegalPageId, { label: string; href: string }[]> = {
  privacy: [
    { label: "Персональные данные", href: "/personal-data" },
    { label: "Cookie", href: "/cookies" },
    { label: "Реквизиты", href: "/requisites" },
  ],
  "personal-data": [
    { label: "Политика конфиденциальности", href: "/privacy" },
    { label: "Cookie", href: "/cookies" },
  ],
  cookies: [
    { label: "Политика конфиденциальности", href: "/privacy" },
  ],
  terms: [
    { label: "Условия продажи", href: "/offer" },
    { label: "Оплата", href: "/payment" },
    { label: "Доставка", href: "/delivery" },
    { label: "Возврат", href: "/returns" },
    { label: "Гарантия", href: "/warranty" },
    { label: "Реквизиты", href: "/requisites" },
  ],
  offer: [
    { label: "Оплата", href: "/payment" },
    { label: "Доставка", href: "/delivery" },
    { label: "Возврат", href: "/returns" },
    { label: "Гарантия", href: "/warranty" },
    { label: "Реквизиты", href: "/requisites" },
    { label: "Контакты", href: "/contacts" },
  ],
  delivery: [
    { label: "Оплата", href: "/payment" },
    { label: "Контакты", href: "/contacts" },
  ],
  payment: [
    { label: "Реквизиты", href: "/requisites" },
    { label: "Доставка", href: "/delivery" },
    { label: "Условия продажи", href: "/offer" },
  ],
  returns: [
    { label: "Гарантия", href: "/warranty" },
    { label: "Контакты", href: "/contacts" },
    { label: "Условия продажи", href: "/offer" },
  ],
  warranty: [
    { label: "Возврат", href: "/returns" },
    { label: "Контакты", href: "/contacts" },
  ],
  requisites: [
    { label: "Условия продажи", href: "/offer" },
    { label: "Оплата", href: "/payment" },
    { label: "Контакты", href: "/contacts" },
  ],
}

export function buildLegalPage(
  id: LegalPageId,
  values: LegalOwnerValues = loadLegalOwnerValuesFromEnv()
): LegalPageModel {
  const incomplete = !isLegalLaunchComplete(values)
  const missing = missingRequiredLegalFields(values)
  const showroom = confirmedShowroomLines()
  const seller = sellerIdentityLines()
  const privacyEmail = String(values.privacy_email ?? "").trim()

  const base = {
    incompleteForPublicLaunch: incomplete,
    missingFieldKeys: missing,
    related: RELATED[id],
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
            heading: "Оператор",
            paragraphs: [
              ...seller,
              "Оператор персональных данных совпадает с продавцом",
            ],
          },
          {
            heading: "Как обратиться",
            paragraphs: [
              ...showroom,
              ...(privacyEmail ? [`Email: ${privacyEmail}`] : []),
              "Письменное обращение можно направить на юридический адрес оператора",
              "Отдельный email для запросов по персональным данным на сайте не публикуется",
            ],
          },
          {
            heading: "Какие данные получаем",
            paragraphs: [
              "Имя, телефон, email и комментарий, которые вы оставляете в заявке или при оформлении заказа",
              "Адрес доставки, если вы его указываете",
              "Технические сведения, нужные для работы сайта и защиты от злоупотреблений",
              "Идентификатор корзины в cookie cart_id",
            ],
          },
          {
            heading: "Зачем обрабатываем",
            paragraphs: [
              "Чтобы связаться с вами по заказу или заявке",
              "Чтобы подтвердить состав, доставку и оплату после согласования с менеджером",
              "Чтобы исполнять договорённости и отвечать на обращения",
            ],
          },
          {
            heading: "Cookie",
            paragraphs: [
              "Сайт использует cookie cart_id, чтобы сохранить корзину между посещениями",
              "Сторонней аналитики и рекламных cookie в витрине нет",
              "Подробнее: страница /cookies",
            ],
          },
          {
            heading: "Передача",
            paragraphs: [
              "Данные могут получить сотрудники Woodright, которые ведут заказ",
              "Если для доставки или оплаты нужен подрядчик, передаём только то, что нужно для этой задачи",
              "Не передаём данные для рекламных рассылок третьим лицам",
            ],
          },
          {
            heading: "Срок и права",
            paragraphs: [
              "Храним данные, пока это нужно для заказа, обращения и требований закона",
              "Вы можете запросить сведения, уточнение, ограничение обработки или удаление там, где это допускает закон",
              "Для этого используйте телефоны, мессенджеры или юридический адрес",
            ],
          },
          {
            heading: "Согласие и документы",
            paragraphs: [
              "Отправляя заявку или заказ, вы передаёте контакты, чтобы мы могли связаться с вами",
              "Краткая страница о персональных данных: /personal-data",
              "Условия покупки: /terms",
            ],
          },
        ],
      }
    case "personal-data":
      return {
        ...base,
        id,
        title: "Персональные данные",
        path: "/personal-data",
        lead: [
          "Какие данные нужны для заявки и заказа, и как с этим обратиться",
        ],
        sections: [
          {
            heading: "Оператор",
            paragraphs: seller,
          },
          {
            heading: "Что вы оставляете",
            paragraphs: [
              "В заявке и на оформлении заказа: имя, телефон, при желании email и комментарий",
              "Адрес нужен, чтобы согласовать доставку",
              "Cookie cart_id хранит корзину на вашем устройстве",
            ],
          },
          {
            heading: "Ваши права",
            paragraphs: [
              "Можно запросить сведения об обработке, уточнение или удаление данных там, где это допускает закон",
              "Пишите или звоните по контактам шоурума, либо направьте письмо на юридический адрес",
            ],
          },
          {
            heading: "Полный текст",
            paragraphs: [
              "Политика конфиденциальности: /privacy",
              "Cookie: /cookies",
            ],
          },
        ],
      }
    case "cookies":
      return {
        ...base,
        id,
        title: "Cookie",
        path: "/cookies",
        lead: [
          "Какие cookie использует витрина Woodright",
        ],
        sections: [
          {
            heading: "cart_id",
            paragraphs: [
              "Это cookie первого лица",
              "Нужна, чтобы сохранить корзину между страницами и визитами",
              "Срок: около 30 дней",
              "SameSite=Lax; на HTTPS ставится флаг Secure",
            ],
          },
          {
            heading: "Чего нет",
            paragraphs: [
              "Google Analytics на витрине нет",
              "Яндекс Метрики нет",
              "Meta Pixel и рекламных cookie нет",
            ],
          },
          {
            heading: "Как отключить",
            paragraphs: [
              "Cookie можно удалить в настройках браузера",
              "Без cart_id корзина на этом устройстве не сохранится",
            ],
          },
        ],
      }
    case "terms":
      return {
        ...base,
        id,
        title: "Условия покупки",
        path: "/terms",
        lead: [
          "Как оформляется заказ на мебель Woodright",
        ],
        sections: [
          {
            heading: "Как проходит оформление",
            paragraphs: [...checkoutCopy.paymentClarity],
          },
          {
            heading: "Что это значит",
            paragraphs: [
              "Отправка заказа на сайте - заявка на подтверждение",
              "Это не оплата и не акцепт оферты",
              "Менеджер проверяет состав и согласовывает условия",
              "Затем отправляет ссылку на оплату или счёт",
            ],
          },
          {
            heading: "Документы",
            paragraphs: [
              "Условия продажи: страница /offer",
              "Оплата: /payment",
              "Доставка: /delivery",
              "Возврат: /returns",
              "Гарантия: /warranty",
              "Продавец: /requisites",
            ],
          },
          {
            heading: "Связь",
            paragraphs: showroom,
          },
        ],
      }
    case "offer":
      return {
        ...base,
        id,
        title: "Условия продажи",
        path: "/offer",
        lead: [
          "Условия продажи мебели Woodright",
        ],
        sections: [
          {
            heading: "Продавец",
            paragraphs: seller,
          },
          {
            heading: "Предмет",
            paragraphs: [
              "Готовая мебель из каталога и модели с предусмотренными вариантами исполнения",
              "Если каталог и штатные варианты не решают задачу, обсуждаем решение в рамках Woodright Bespoke",
              "Bespoke - направление той же компании, не отдельный продавец",
            ],
          },
          {
            heading: "Заявка на сайте",
            paragraphs: [
              "Отправка заказа на сайте - заявка на подтверждение",
              "Это не оплата и не акцепт оферты",
              "Менеджер проверяет состав заказа и согласовывает условия",
              "Оплата проходит по ссылке или счёту, которые менеджер отправляет отдельно",
            ],
          },
          {
            heading: "Оплата",
            paragraphs: [
              "Оплачивать заказ сразу на сайте не нужно",
              "После согласования менеджер отправляет PaymentLink или счёт",
              "Банковские реквизиты на сайте не публикуются",
              "Подробнее: /payment",
            ],
          },
          {
            heading: "Доставка",
            paragraphs: [
              "Стоимость и условия доставки зависят от адреса и состава заказа",
              "Публичного тарифа нет",
              "Условия согласовываются менеджером до оплаты",
              "Подробнее: /delivery",
            ],
          },
          {
            heading: "Возврат",
            paragraphs: [
              "Обязательные права потребителя сохраняются",
              "Ярлык Bespoke или «с выбором исполнения» сам по себе не отменяет возврат",
              "Порядок: свяжитесь с Woodright, менеджер уточнит заказ и обстоятельства",
              "Подробнее: /returns",
            ],
          },
          {
            heading: "Гарантия",
            paragraphs: [
              "Гарантия Woodright - 12 месяцев",
              "Законные права при недостатках товара сохраняются",
              "Подробнее: /warranty",
            ],
          },
          {
            heading: "Споры",
            paragraphs: [
              String(values.dispute_contact_process ?? "").trim(),
            ].filter(Boolean),
          },
          {
            heading: "Связь",
            paragraphs: showroom,
          },
        ],
      }
    case "delivery":
      return {
        ...base,
        id,
        title: "Доставка",
        path: "/delivery",
        lead: [
          "Стоимость и условия доставки зависят от адреса и состава заказа",
          "После оформления менеджер проверит детали и согласует условия до оплаты",
        ],
        sections: [
          {
            heading: "Как это работает",
            paragraphs: [
              "Публичного фиксированного тарифа нет",
              "Оформление заказа на сайте не назначает цену доставки",
              "Ноль в техническом поле доставки на оформлении не означает бесплатную доставку",
              "Менеджер согласует условия до оплаты",
            ],
          },
          {
            heading: "Что влияет на расчёт",
            paragraphs: [
              "Адрес",
              "Состав и габариты заказа",
              "Другие условия, которые нужно уточнить по факту",
            ],
          },
          {
            heading: "Что уточнит менеджер",
            paragraphs: [
              "Адрес и возможность доставки",
              "Состав и габариты заказа",
              "Итоговые условия до оплаты",
            ],
          },
          {
            heading: "Оплата",
            paragraphs: [
              "Сначала согласовываем заказ и доставку",
              "Затем менеджер отправляет ссылку на оплату или счёт",
              "Подробнее: /payment",
            ],
          },
          {
            heading: "Связь",
            paragraphs: showroom,
          },
        ],
      }
    case "payment":
      return {
        ...base,
        id,
        title: "Оплата",
        path: "/payment",
        lead: [
          "Оплачивать заказ сразу на сайте не нужно",
          "После оформления менеджер проверит детали и отправит ссылку на оплату или счёт",
        ],
        sections: [
          {
            heading: "Как проходит оплата",
            paragraphs: [
              "Вы отправляете заказ",
              "Менеджер проверяет состав и уточняет нужные детали",
              "Подтверждаются итоговые условия, включая доставку",
              "Вы получаете PaymentLink или счёт и оплачиваете вне оформления на сайте",
            ],
          },
          {
            heading: "Чего нет на сайте",
            paragraphs: [
              "Оплаты картой на странице оформления",
              "QR и СБП как публичного способа",
              "Рассрочки и оплаты частями",
              "Публичных банковских реквизитов",
            ],
          },
          {
            heading: "Документы",
            paragraphs: [
              "Реквизиты продавца: /requisites",
              "Банковские данные при необходимости приходят в счёте, не на витрине",
            ],
          },
          {
            heading: "Связь",
            paragraphs: showroom,
          },
        ],
      }
    case "returns":
      return {
        ...base,
        id,
        title: "Возврат",
        path: "/returns",
        lead: [
          "Если хотите отказаться от заказа, вернуть товар или сообщить о проблеме, свяжитесь с Woodright",
        ],
        sections: [
          {
            heading: "Как обратиться",
            paragraphs: [
              ...showroom,
              "Назовите номер заказа, если он уже есть",
              "Менеджер уточнит обстоятельства и подскажет следующий шаг",
            ],
          },
          {
            heading: "Разные ситуации",
            paragraphs: [
              "Отказ до передачи товара и возврат после получения рассматриваются отдельно",
              "Недостаток, повреждение при доставке, неполный или неверный состав - это обращения о проблеме с заказом",
            ],
          },
          {
            heading: "Срок и закон",
            paragraphs: [
              "Срок зависит от ситуации и применимого закона",
              "У Woodright нет своего отдельного окна возврата без причины",
              "Для изделий по индивидуальным параметрам закон может ограничивать отказ от товара надлежащего качества",
              "Это зависит от обстоятельств заказа, а не от ярлыка на сайте",
            ],
          },
          {
            heading: "Права по закону",
            paragraphs: [
              "Обязательные права потребителя сохраняются",
              "Рассмотрим обращение в сроки, предусмотренные законом",
            ],
          },
        ],
      }
    case "warranty":
      return {
        ...base,
        id,
        title: "Гарантия",
        path: "/warranty",
        lead: [
          "Гарантия Woodright - 12 месяцев",
        ],
        sections: [
          {
            heading: "Срок",
            paragraphs: [
              "Базовый коммерческий срок гарантии Woodright - 12 месяцев",
              "Ярлык товара не создаёт отдельный срок",
            ],
          },
          {
            heading: "Как обратиться",
            paragraphs: [
              ...showroom,
              "Менеджер поможет понять, это гарантийный случай, возврат или другой вопрос",
            ],
          },
          {
            heading: "Что сохраняется",
            paragraphs: [
              "Законные права при недостатках товара сохраняются",
              "Коммерческая гарантия их не отменяет",
            ],
          },
          {
            heading: "Что ещё учесть",
            paragraphs: [
              "Здесь указан базовый срок гарантии Woodright",
              "Отдельные сроки на фурнитуру, механизмы или панели не публикуются",
            ],
          },
        ],
      }
    case "requisites":
      return {
        ...base,
        id,
        title: "Реквизиты",
        path: "/requisites",
        lead: [
          "Кто продаёт мебель Woodright",
        ],
        sections: [
          {
            heading: "Продавец",
            paragraphs: seller,
          },
          {
            heading: "Банковские реквизиты",
            paragraphs: [
              "На сайте их нет",
              "Если для оплаты по счёту они нужны, менеджер укажет их в счёте",
            ],
          },
          {
            heading: "Шоурум",
            paragraphs: [
              "Адрес шоурума в Химках - место встречи, не юридический адрес",
              ...showroom,
            ],
          },
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
