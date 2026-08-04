/**
 * Централизованный слой buyer-facing микрокопии Woodright.
 *
 * Единственный источник повторяющихся строк (CTA, labels, empty/error/loading
 * states, SEO). Уникальные тексты страниц (hero, лиды, supporting-строки) тоже
 * собраны здесь по разделам, чтобы не размазывать голос бренда по компонентам.
 *
 * Это content-слой: сюда не должна попадать бизнес-логика (расчёт цены,
 * классификация товаров и т.д.) - только текст и подписи для готовых веток UI.
 *
 * Тон: спокойный, уверенный, премиальный без пафоса. Один экран - один смысл.
 * Лид ≤ 2 строк; длинное дробится на лид + тезисы + supporting + CTA.
 * Тире в RU-строках: только ` - ` (`.cursor/rules/dash-typography.mdc`).
 * Точки / отбивки / висячие предлоги: `.cursor/rules/ux-copywriting.mdc`.
 * Одно предложение в UI - без конечной точки; две мысли - две строки (`string[]`).
 *
 * Некоторые поля (`note`, `supporting`) пока не выводятся в JSX -
 * они готовы к использованию, точечные правки разметки описаны в отчёте.
 * Публичные контакты шоурума (адрес, телефоны, мессенджеры, shortLabel) - только
 * `@/lib/showroom-contacts`, не дублировать здесь.
 */

import { showroomContacts } from "@/lib/showroom-contacts"

export const nav = {
  /** Desktop/mobile chrome label - SoT: showroomContacts.shortLabel */
  showroom: showroomContacts.shortLabel,
  designers: "Дизайнерам",
  contacts: "Контакты",
  catalog: "Каталог",
  rooms: "Комнаты",
  kids: "Детская",
  bespoke: "По проекту",
  about: "О бренде",
  cart: "Корзина",
}

export const a11yCopy = {
  skipToContent: "Перейти к содержимому",
  openMenu: "Открыть меню",
  closeMenu: "Закрыть меню",
  mobileNavLabel: "Мобильная навигация",
  openFilters: "Открыть фильтры",
  closeFilters: "Закрыть фильтры",
  catalogFiltersLabel: "Фильтры каталога",
  activeFiltersLabel: "Активные фильтры",
  applyFilters: "Показать результаты",
}

export const systemCopy = {
  notFound: {
    label: "404",
    title: "Страница не найдена",
    body: [
      "Возможно, ссылка устарела или страница была перемещена",
      "Перейдите в каталог или вернитесь на главную",
    ],
    ctaPrimary: "Перейти в каталог",
    ctaSecondary: "На главную",
  },
  error: {
    label: "Ошибка",
    title: "Не удалось загрузить страницу",
    body: [
      "Попробуйте обновить страницу",
      "Если ошибка повторится, вернитесь в каталог",
    ],
    ctaPrimary: "Попробовать снова",
    ctaSecondary: "Перейти в каталог",
  },
  loading: {
    label: "Загружаем…",
  },
}

export const footer = {
  /** Masthead under brand wordmark. Lead + disc bullets + closing;
   * each string is one grid row (same pitch as nav links). */
  brandText: {
    lead: ["Мебель из массива", "для взрослых и детских комнат"],
    bullets: ["Готовые модели", "Окрашивание и роспись", "Стеновые панели"],
    closing: ["Проекты любой сложности"],
  },
  columns: [
    {
      title: "Каталог",
      links: [
        { label: "Все предметы", href: "/catalog" },
        { label: "Готовые модели", href: "/catalog?product_type=STANDARD" },
        { label: "С выбором исполнения", href: "/catalog?product_type=CONFIGURABLE" },
        { label: "Комнаты", href: "/rooms" },
      ],
    },
    {
      title: "Детская",
      links: [
        { label: "О разделе", href: "/kids" },
        { label: "Каталог", href: "/kids/catalog" },
        { label: "Росписи Вилли Винки", href: "/kids/willie-winkie" },
        { label: "Детские комнаты", href: "/kids/rooms" },
      ],
    },
    {
      title: "По проекту",
      links: [
        { label: "Оставить заявку", href: "/bespoke/request" },
        { label: "Направления", href: "/bespoke/catalog" },
        { label: "Как это работает", href: "/bespoke" },
      ],
    },
    {
      title: "Woodright",
      links: [
        { label: "О бренде", href: "/about" },
        { label: "Производство", href: "/about/production" },
        { label: "Материалы", href: "/about/materials" },
        { label: "Дизайнерам", href: "/designers/terms" },
        { label: "Контакты", href: "/contacts" },
        // Legal routes exist for prep/preview; footer links ship only after
        // owner legal inputs complete (cutover). Avoid presenting incomplete
        // оферта/политика as finished buyer documents.
      ],
    },
    {
      title: "Покупателям",
      links: [
        { label: "Доставка", href: "/delivery" },
        { label: "Оплата", href: "/payment" },
        { label: "Возврат", href: "/returns" },
        { label: "Гарантия", href: "/warranty" },
        { label: "Политика конфиденциальности", href: "/privacy" },
        { label: "Персональные данные", href: "/personal-data" },
        { label: "Cookies", href: "/cookies" },
        { label: "Условия пользования", href: "/terms" },
        { label: "Оферта", href: "/offer" },
        { label: "Реквизиты", href: "/requisites" },
        { label: "Контакты", href: "/contacts" },
      ],
    },
  ],
  copyright: (year: number) => `© ${year} Woodright`,
}

export const actions = {
  viewCatalog: "Смотреть каталог",
  openCatalog: "Открыть каталог",
  viewProduct: "Подробнее",
  addToCart: "Добавить в корзину",
  chooseExecution: "Выбрать исполнение",
  /** PDP CTA while required execution groups are still empty. */
  chooseParameters: "Выберите параметры",
  requestQuote: "Запросить расчёт",
  getConsultation: "Получить консультацию",
  discussProject: "Обсудить проект",
  resetFilters: "Сбросить фильтры",
  showAll: "Показать все",
  continueShopping: "Продолжить выбор",
  checkout: "Оформить заказ",
  sendRequest: "Отправить заявку",
  toCart: "В корзину",
  toRooms: "В комнаты",
  toHome: "На главную",
}

export const labels = {
  ready: "Готовый товар",
  configurable: "С выбором исполнения",
  bespoke: "По проекту",
  requestQuotePrice: "Цена по запросу",
  wood: "Массив дерева",
  handPainted: "Ручная роспись",
  kidsCollection: "Детская коллекция",
}

/** BESPOKE badge label unified with the "По проекту" nav section / tab. */
export const productTypeBadgeLabels: Record<string, string> = {
  BESPOKE: "По проекту",
}

export const states = {
  loadingCatalog: "Загружаем каталог…",
  noPhoto: "Фото скоро появится",
  genericErrorTitle: "Что-то пошло не так",
  genericErrorBody: [
    "Обновите страницу",
    "Если не поможет",
    "напишите нам, решим вручную",
  ],
}

export const catalogCopy = {
  h1: "Мебель для каждой комнаты",
  lead: "Спальня, гостиная, кабинет, прихожая",
  kidsLead: "Мебель для детской в Woodright Kids",
  supporting: "Фильтры помогут сузить выбор по комнате, коллекции и цене",
  loadError: [
    "Каталог не загрузился",
    "Обновите страницу или зайдите чуть позже",
  ],
  emptyFilteredTitle: "Ничего не нашлось по фильтрам",
  emptyFilteredBody: [
    "Снимите часть условий",
    "или опишите задачу, и мы соберём исполнение по проекту",
  ],
}

export const kidsCatalogCopy = {
  h1: "Мебель для детской комнаты",
  lead: [
    "Кровати, шкафы, комоды, столы и стеллажи",
    "Коллекции с ручной росписью - для комнаты, которая растёт вместе с ребёнком",
  ],
  loadError: [
    "Детский каталог не загрузился",
    "Обновите страницу или зайдите чуть позже",
  ],
  emptyTitle: "Здесь пока пусто по этим фильтрам",
  emptyBody: [
    "Измените параметры",
    "или напишите нам, подберём по комнате, возрасту и характеру ребёнка",
  ],
}

export const kidsHome = {
  h1: "Детская, в которой хочется расти",
  lead: [
    "Массив дерева, спокойные формы и ручная роспись",
    "Не мебель на пару лет, а основа комнаты",
    "для сна, игры и первых книг",
  ],
  supporting: "Отдельные предметы, готовые детские комнаты или мебель под ваш проект",
  ctaCatalog: "Смотреть детскую мебель",
  ctaRooms: "Готовые детские комнаты",
  ctaBespoke: "Обсудить проект",
  ctaWillieWinkie: "Росписи Вилли Винки",
}

export const willieWinkieMotifsCopy = {
  directoryH1: "Росписи Вилли Винки",
  directoryCrumb: "Детская / Вилли Винки",
  directoryLead: [
    "Ручная роспись на массиве дерева",
    "Каждая тема - свой характер рисунка и свой набор мебели",
  ],
  directoryHeroCta: "Смотреть росписи",
  directorySectionTitle: "Выберите роспись",
  directorySectionLead: "Откройте тему и посмотрите доступную мебель",
  directoryMeta: (motifs: number, products: number) =>
    `${willieWinkieMotifsCopy.motifCountLabel(motifs)} · ${willieWinkieMotifsCopy.productCountLabel(products)}`,
  motifCountLabel: (n: number) =>
    n === 1 ? "1 роспись" : n >= 2 && n <= 4 ? `${n} росписи` : `${n} росписей`,
  directoryLoadError: [
    "Росписи не загрузились",
    "Обновите страницу или зайдите чуть позже",
  ],
  directoryEmptyTitle: "Росписи временно недоступны",
  directoryEmptyBody: "Загляните в каталог детской мебели",
  motifNotFoundTitle: "Такой росписи нет",
  motifNotFoundBody: "Выберите тему из каталога росписей Вилли Винки",
  motifLoadError: [
    "Не удалось загрузить роспись",
    "Обновите страницу или зайдите чуть позже",
  ],
  motifEmptyTitle: "В этой росписи пока нет доступной мебели",
  motifEmptyBody: "Загляните в другие темы или в каталог детской мебели",
  availableTypesPrefix: "Мебель",
  productsSectionTitle: "Мебель с этой росписью",
  /** Neutral availability copy - never use restrictive «только». */
  productsOnlySubhead: "Доступны эти предметы",
  productsSectionMeta: (n: number) =>
    n === 1
      ? "1 доступный предмет"
      : n >= 2 && n <= 4
        ? `${n} доступных предмета`
        : `${n} доступных предметов`,
  productsToAnchor: "К предметам",
  productCountLabel: (n: number) =>
    n === 1 ? "1 предмет" : n >= 2 && n <= 4 ? `${n} предмета` : `${n} предметов`,
  familyCountLabel: (n: number) =>
    n === 1 ? "1 вид мебели" : n >= 2 && n <= 4 ? `${n} вида мебели` : `${n} видов мебели`,
  familiesLine: (titles: string[]) => {
    if (titles.length === 0) return null
    if (titles.length <= 3) return titles.join(", ")
    return `${titles.slice(0, 3).join(", ")} и ещё ${titles.length - 3}`
  },
  tileMeta: (familyCount: number, productCount: number) =>
    `${willieWinkieMotifsCopy.familyCountLabel(familyCount)} · ${willieWinkieMotifsCopy.productCountLabel(productCount)}`,
  cardCta: "Смотреть",
  youAreHere: "Вы здесь",
  backToDirectory: "Все росписи Вилли Винки",
  backToDirectoryShort: "Вилли Винки",
  backToKids: "В детскую секцию",
  openCatalog: "В каталог детской мебели",
  reloadPage: "Обновить страницу",
  detailItemsMeta: (n: number) => `Предметов - ${n}`,
  viewAllInMotif: "Посмотреть всю мебель в этой росписи",
  relatedTitle: "Другие предметы в этой росписи",
  motifSelectorLabel: "Роспись",
  motifChooseLink: "Все росписи",
  motifUnavailableTitle: "Эта роспись недоступна для выбранного предмета",
  motifUnavailableBody: "Показана штатная конфигурация товара",
  motifUnknownTitle: "Выбранная роспись не найдена",
  motifUnknownBody: "Показана штатная конфигурация товара",
  priceUnavailable: "Цену уточним",
  imageMissing: "Фото скоро появится",
}

export const roomsCopy = {
  h1: "Комната целиком, а не набор предметов",
  lead: [
    "Спальня, детская, кабинет, гостиная, прихожая",
    "Готовые сочетания, где сохранены стиль, пропорции и удобство",
  ],
  supporting: "Можно взять комплект целиком или начать с одного предмета",
  loadError: [
    "Комнаты не загрузились",
    "Обновите страницу или зайдите чуть позже",
  ],
  emptyBody: "Готовые комплекты скоро появятся",
  kidsEntryTitle: "Детские комнаты",
  kidsEntryText: "Безопасные материалы, продуманная эргономика и роспись, которая нравится и детям, и взрослым",
}

export const kidsRoomsCopy = {
  h1: "Детские комнаты",
  lead: [
    "Готовые комплекты",
    "от первых лет до школы",
  ],
  loadError: [
    "Детские комнаты не загрузились",
    "Обновите страницу или зайдите чуть позже",
  ],
  emptyBody: [
    "Комплекты для детских ещё готовим",
    "Загляните в каталог или напишите нам",
    "подберём комнату под ребёнка",
  ],
}

export const roomSetDetail = {
  notFound: "Комплект не найден",
  loadError: [
    "Не удалось загрузить комплект",
    "Обновите страницу",
  ],
  priceFromLabel: "Цена от",
  priceUnknown: "уточняется",
  compositionTitle: "Что входит в комплект",
  openProduct: "Открыть товар",
}

export const bespokeLanding = {
  h1: "Мебель под конкретный интерьер",
  lead: [
    "Цельная комната, особая отделка или мебель под ваши размеры",
    "Начните с заявки",
    "остальное подскажем",
  ],
  supporting: "Работаем и с отдельными предметами, и с комнатой под ключ",
  ctaPrimary: "Обсудить проект",
  ctaSecondary: "Смотреть направления",
  whenTitle: "Когда это ваш вариант",
  whenItems: [
    { title: "Комната целиком", text: "спальня, детская, кабинет или гостиная в едином стиле" },
    { title: "Своя отделка", text: "конкретный цвет, ткань или сочетание материалов" },
    { title: "Есть дизайн-проект", text: "подберём мебель под готовую концепцию" },
    { title: "Нужен совет", text: "разберём размеры, состав, сроки и стоимость" },
  ],
  processTitle: "Как мы работаем",
  processSteps: [
    { title: "Расскажете задачу", text: "Комната, размеры, стиль и сроки" },
    { title: "Подберём состав", text: "Модели, отделки, ткани и варианты исполнения" },
    { title: "Посчитаем", text: "Зафиксируем состав, стоимость и следующие шаги" },
    { title: "Запустим в работу", text: "После согласования - производство или подготовка к отгрузке" },
  ],
  note: [
    "Начните с заявки",
    "Остальное подскажем",
  ],
  finalCta: {
    title: "Опишите задачу",
    text: [
      "Комната, размеры и сроки",
      "Вернёмся с составом и ориентиром по цене",
    ],
    button: "Обсудить проект",
  },
}

export const bespokeCatalogCopy = {
  h1: "Направления по проекту",
  lead: "Кухни, гардеробные, шкафы и другие изделия по вашим размерам",
  loadError: [
    "Не загрузилось",
    "Обновите страницу",
  ],
  emptyBody: [
    "Позиции скоро появятся",
    "Опишите задачу - соберём решение под вас",
  ],
  emptyCtaRequest: "Заявка на расчёт",
  emptyCtaSection: "В раздел «По проекту»",
}

export const bespokeRequestCopy = {
  h1: "Расскажите о проекте",
  lead: [
    "Опишите комнату, предметы и желаемые сроки",
    "Мы вернёмся с вопросами, составом мебели и ориентиром по стоимости",
  ],
  introTitle: "Для расчёта пригодится",
  introBullets: [
    "Предметы, которые нужны",
    "Размеры или план комнаты",
    "Отделка, цвет или коллекция",
    "Сроки и город",
  ],
  nextStepsTitle: "Что дальше",
  nextStepsBullets: [
    "Мы изучим задачу",
    "Уточним детали, если потребуется",
    "Вернёмся с составом, сроками и ориентиром по стоимости",
  ],
  introCaption: [
    "Если не знаете всех деталей, это не проблема",
    "можно написать в свободной форме",
  ],
  formTitle: "Заявка на расчёт",
  formCaption: [
    "Оставьте контакты и пару слов о задаче",
    "Этого достаточно для первого ответа",
  ],
}

export const bespokeForm = {
  fields: {
    name: "Имя",
    phone: "Телефон",
    email: "Email",
    city: "Город",
    taskType: "Что нужно рассчитать",
    comment: "Комментарий",
  },
  placeholders: {
    name: "Как к вам обращаться",
    phone: "+7 ___ ___-__-__",
    email: "name@example.com",
    city: "Москва",
    comment: "Например: детская для двоих детей, кровать, шкаф, рабочее место, спокойные светлые оттенки, срок - к сентябрю",
  },
  taskOptions: [
    { value: "single_item", label: "Отдельный предмет" },
    { value: "full_room", label: "Комнату целиком" },
    { value: "kids_room", label: "Детскую" },
    { value: "by_drawings", label: "Мебель по чертежам" },
    { value: "not_sure", label: "Ещё не знаю" },
  ],
  taskPlaceholder: "Выберите вариант",
  submit: "Отправить заявку",
  submitting: "Отправляем…",
  nameRequired: "Подскажите, как к вам обращаться",
  phoneRequired: [
    "Оставьте телефон",
    "так нам будет проще всего ответить",
  ],
  serverError: [
    "Не удалось отправить заявку",
    "Проверьте контакты или попробуйте ещё раз",
  ],
  successTitle: "Заявка отправлена",
  successBody: [
    "Спасибо",
    "Мы посмотрим задачу и вернёмся с уточнениями по составу, срокам и стоимости",
  ],
  successCta: "Перейти в каталог",
  consentNote: [
    "Нажимая кнопку, вы соглашаетесь на обработку персональных данных",
    "Контакты используем только для ответа по заявке",
  ],
  consentPrivacyLabel: "Политика конфиденциальности",
  consentPrivacyHref: "/privacy",
  consentPersonalDataLabel: "Персональные данные",
  consentPersonalDataHref: "/personal-data",
}

export const cartCopy = {
  title: "Корзина",
  lead: [
    "Проверьте состав, исполнение и количество",
    "Оформление займёт пару минут",
    "понадобятся контакты и адрес",
  ],
  formTitle: "Состав заказа",
  formCaption: [
    "Убедитесь, что всё верно",
    "изменить состав после оформления можно через менеджера",
  ],
  emptyTitle: "В корзине пусто",
  emptyBody: [
    "Загляните в каталог: выберите готовую модель или настройте исполнение",
    "Проектные позиции",
    "через заявку",
  ],
  invalidState: [
    "Корзина недоступна",
    "возможно, устарела",
    "Начните выбор заново",
  ],
  loadError: [
    "Корзина не загрузилась",
    "Обновите страницу",
  ],
  removeError: [
    "Не удалось убрать товар",
    "Попробуйте ещё раз",
  ],
  updating: "Обновляем…",
  total: "Итого",
  removeItemLabel: "Удалить товар",
  nextStepsTitle: "Что дальше",
  nextStepsBullets: [
    "Укажете контакты и адрес доставки",
    "Подтвердим состав и сроки",
    "Свяжемся по доставке, сборке и оплате",
  ],
  asideCaption: [
    "Если хочется что-то поменять в исполнении",
    "можно написать нам после оформления, поможем скорректировать",
  ],
}

export const checkoutCopy = {
  title: "Оформление заказа",
  lead: [
    "Контакты и адрес доставки",
    "Подтвердим заказ и свяжемся по доставке и сборке",
  ],
  formTitle: "Контакты и доставка",
  formCaption: [
    "Укажите имя и телефон",
    "этого достаточно, чтобы подтвердить заказ",
    "Адрес доставки менеджер уточнит при звонке",
  ],
  emptyCartTitle: "Корзина пуста",
  emptyCartBody: "Пока корзина пуста, оформить заказ нельзя",
  invalidState: "Корзина повреждена или недоступна",
  loadError: [
    "Корзина не загрузилась",
    "Обновите страницу",
  ],
  validationError: "Проверьте обязательные поля",
  nameRequired: "Подскажите, как к вам обращаться",
  phoneRequired: [
    "Оставьте телефон",
    "так нам будет проще всего подтвердить заказ",
  ],
  serverError: [
    "Заказ не оформился",
    "Попробуйте ещё раз или напишите нам",
  ],
  submitting: "Отправляем…",
  submit: "Отправить заказ",
  consentNote: [
    "Нажимая кнопку, вы соглашаетесь на обработку персональных данных и принимаете условия оферты",
    "Контакты и адрес используем для подтверждения заказа и доставки",
  ],
  consentPrivacyLabel: "Политика конфиденциальности",
  consentPrivacyHref: "/privacy",
  consentPersonalDataLabel: "Персональные данные",
  consentPersonalDataHref: "/personal-data",
  consentOfferLabel: "Оферта",
  consentOfferHref: "/offer",
  paymentClarity:
    [
    "Сейчас оплачивать заказ не нужно",
    "После оформления менеджер подтвердит состав заказа, согласует доставку и пришлёт ссылку на оплату",
  ],
  compositionTitle: "Состав заказа",
  nextStepsTitle: "Что дальше",
  nextStepsBullets: [
    "Подтвердим состав и сроки",
    "Уточним адрес, детали доставки и сборки",
    "Пришлём ссылку на оплату",
  ],
  asideCaption: [
    "Если в заказе что-то нужно поменять",
    "напишите нам после оформления, поможем скорректировать",
  ],
  successTitle: "Заказ отправлен на подтверждение",
  successCta: "Перейти в каталог",
  orderNumberLabel: "Номер заказа",
  orderNumberNote: [
    "Сохраните номер",
    "он понадобится при оплате и вопросах менеджеру",
  ],
  trackOrderCta: "Следить за заказом",
  trackOrderHint: "Откройте ссылку, чтобы видеть статус изготовления",
  paymentNote:
    [
    "Заказ отправлен на подтверждение",
    "Менеджер свяжется с вами, уточнит детали и пришлёт ссылку на оплату",
  ],
  fields: {
    name: "Имя",
    phone: "Телефон",
    email: "Email",
    address: "Адрес",
    city: "Город",
    country: "Страна",
  },
  placeholders: {
    name: "Как к вам обращаться",
    phone: "+7 ___ ___-__-__",
    email: "name@example.com",
    address: "Улица, дом, квартира",
    city: "Москва",
  },
}

export const productCta = {
  addingInProgress: "Добавляем…",
  addedTitle: "Добавили в корзину",
  addToCartFailed: [
    "Не удалось добавить",
    "Попробуйте ещё раз или оставьте заявку",
  ],
  noVariant: "Этот вариант сейчас недоступен",
  configureBespoke: "Сделать по моим размерам",
  bespokeManagerNote: "Финальную стоимость подтвердит менеджер",
  bespokeCtaLabel: "Запросить расчёт",
  requestQuoteCtaLabel: "Оставить заявку",
  requestQuoteManagerNote: "Уточним состав, отделку и подготовим расчёт",
  unavailableCtaLabel: "Узнать о возобновлении",
  madeToOrderCtaLabel: "Заказать",
  configurableToOrderCtaLabel: "Настроить и заказать",
  discussProjectCtaLabel: "Обсудить проект",
}

export const orderTrackCopy = {
  title: "Статус заказа",
  loading: "Загружаем статус…",
  missingParams: "Откройте ссылку из письма или экрана оформления заказа",
  loadError: [
    "Не удалось загрузить статус",
    "Проверьте ссылку или напишите нам",
  ],
  consolidatedHeading: "Сейчас по заказу",
  paymentHeading: "Оплата",
  productionHeading: "Изготовление",
  deliveryHeading: "Доставка",
  timelineHeading: "Этапы",
  eventsHeading: "История",
  nextActionLabel: "Что дальше",
  noEvents: "Пока нет обновлений",
}

export const pdpCopy = {
  notFoundTitle: "Товар не найден",
  errorTitle: "Не удалось загрузить товар",
  errorBody: "Обновите страницу или вернитесь в каталог",
  sizeSelectorLabel: "Размер",
  articleLabel: "Арт.",
  dimensionHeight: "Высота",
  dimensionWidth: "Ширина",
  dimensionDepth: "Глубина",
  unitCm: "см",
  unitMm: "мм",
  descriptionHeading: "Описание",
  specsHeading: "Характеристики",
  specCollection: "Коллекция",
  specArticle: "Артикул",
  /** Shown next to an option group title before the buyer picks a value. */
  optionChooseValue: "Выберите",
  /** Material execution dropdown + cart line spec label. */
  materialTierLabel: "Исполнение",
  serviceLines: [
    "Массив дерева и ручная отделка",
    "Шоурум в Химках - принимаем по договорённости",
  ],
  serviceConsultLabel: "Получить консультацию",
}

export const pdpLightboxCopy = {
  open: "Открыть фото на весь экран",
  close: "Закрыть",
  prev: "Предыдущее фото",
  next: "Следующее фото",
  zoomIn: "Увеличить фото",
  zoomOut: "Вернуть масштаб",
  thumbsLabel: "Все фото",
  dialogSuffix: "фото",
}

export const aboutCopy = {
  h1: "Мебель, которая складывается в дом",
  lead: [
    "Готовые модели, коллекции, ручная отделка и мебель под проект",
    "для взрослых и детских комнат",
  ],
  missionTitle: "Характер важнее стандарта",
  missionText: [
    "Нам важны материал, пропорции и отделка",
    "Ремесленную основу переводим в понятный выбор: каталог, коллекции, готовые комнаты и работа по проекту",
  ],
}

export const aboutMaterialsCopy = {
  h1: "Материалы и отделки",
  lead: [
    "Дерево, цвет, фактура, детали",
    "Один предмет звучит по-разному",
    "в зависимости от отделки и окружения",
  ],
  body: [
    "Работаем с массивом, продуманными отделками и тканями",
    "Нужны своя фактура, цвет или сочетание",
    "опишите в заявке, подберём",
  ],
}

export const aboutProductionCopy = {
  h1: "Производство и отделка",
  lead: [
    "Мебель из массива с расчётом на долгую службу",
    "выверенные пропорции, аккуратная сборка, отделка под комнату",
  ],
  body: [
    "Каждая модель проходит путь от массива до готового предмета с ручной отделкой",
    "Серийные - из готовых вариантов, проектные - под задачу",
  ],
}

export const designersLandingCopy = {
  eyebrow: "Дизайнерам и архитекторам",
  h1: "Мебель для частных и общественных интерьеров",
  lead:
    [
    "Помогаем подобрать модели, материалы и исполнения под интерьерный проект",
    "Для нестандартных задач можно отправить описание проекта и получить обратную связь от команды Woodright",
  ],
  ctaPrimary: "Обсудить проект",
  ctaSecondary: "Перейти в каталог",
  termsLink: "Условия сотрудничества",
  materialsLink: "Материалы",
}

export const designersTermsCopy = {
  h1: "Дизайнерам и архитекторам",
  lead: "Подбираем мебель из массива для частных интерьеров, детских и проектных комплектаций",
  body: [
    "Расскажите о проекте клиента",
    "соберём предметы, отделки и состав комнаты, поможем со сроками и сметой",
  ],
  ctaPrimary: "Оставить заявку",
  ctaSecondary: "Каталог",
}

export const designersMaterialsCopy = {
  h1: "Материалы для дизайнеров",
  lead: [
    "Отделки, ткани и варианты исполнения",
    "для проектной работы",
  ],
  body: [
    "Нужны подборка материалов, образцы или технические параметры",
    "опишите задачу, вернёмся с материалами под проект",
  ],
  ctaPrimary: "Оставить заявку",
  ctaSecondary: "Условия сотрудничества",
}

export const designersRequestCopy = {
  h1: "Заявка на сотрудничество",
  lead: [
    "Комната, задача, желаемые предметы и сроки",
    "Свяжемся, обсудим подбор и условия",
  ],
  ctaPrimary: "Оставить заявку на расчёт",
  ctaSecondary: "Условия сотрудничества",
}

export const contactsCopy = {
  h1: "Контакты",
  /** Single flowing intro - width driven by master-grid span, no forced breaks. */
  lead: "Уточнить наличие, подобрать исполнение или обсудить индивидуальный проект можно по телефону или в мессенджерах",
  showroomEyebrow: "Шоурум",
  /** Action-title pair with `channelsHeading` on the contacts column. */
  showroomHeading: "Посетить магазин Woodright",
  channelsEyebrow: "Контакты",
  channelsHeading: "Связаться с Woodright",
  messengersLabel: "Мессенджеры",
  /** Full accessible name for the Yandex Maps link. */
  mapCta: "Посмотреть в Яндекс Картах",
  /** Page map tile kicker - pairs with phone kicker/value rhythm. */
  mapKicker: "Маршрут",
  /** Page/dropdown visible map value (one line). */
  mapValue: "Яндекс Карты",
  /** Compact showroom phone CTA for header dropdown. */
  showroomCallCta: "Позвонить в шоурум",
  /**
   * Page messenger tile kicker (secondary). Service name is the large value
   * from `showroomContacts.messengers[].label`. Dropdown stays name-only.
   */
  messengerWriteKicker: "Написать в",
  /** Accessible names for messenger links (visible label stays short in dropdown). */
  messengerTelegramAria: "Написать в Telegram",
  messengerWhatsappAria: "Написать в WhatsApp",
  messengerMaxAria: "Написать в MAX",
  ctaTitle: "Есть вопрос по мебели или индивидуальному проекту?",
  ctaBody:
    "Оставьте заявку - менеджер свяжется с вами и поможет подобрать решение",
  ctaPrimary: "Оставить заявку",
}

export const homeCopy = {
  hero: {
    h1: "Мебель, которая складывается в дом",
    lead: [
      "Готовые предметы, детские коллекции и мебель под проект",
      "в спокойной классике из массива",
    ],
    note: "Собственное производство: от массива до ручной отделки",
    ctaPrimary: "Смотреть каталог",
    ctaSecondary: "Собрать комнату",
    chips: ["Массив дерева", "Ручная отделка", "Готовые модели", "Детские коллекции", "По проекту"],
  },
  quickEntries: {
    title: "С чего начать",
    cards: [
      { title: "Каталог", text: "Кровати, шкафы, комоды и столы - коллекциями или по одному предмету", cta: "Смотреть каталог", href: "/catalog" },
      { title: "Комнаты", text: "Собранные сочетания предметов для спальни, детской, кабинета и гостиной", cta: "Выбрать комнату", href: "/rooms" },
      { title: "Детская", text: [
        "Массив и ручная роспись",
        "комната, из которой не вырастают за год",
      ], cta: "В детский раздел", href: "/kids" },
      { title: "По проекту", text: "Подбор моделей, отделок и состава комнаты под ваш интерьер", cta: "Обсудить проект", href: "/bespoke" },
    ],
  },
  woodBlock: {
    title: "Классика, которой не нужно обновляться",
    text: [
      "Массив дерева, выверенные пропорции и ничего лишнего",
      "Предметы собираются в гарнитуры и спокойно входят в уже сложившийся интерьер",
    ],
    bullets: [
      "Массив дерева с видимой фактурой",
      "Выбор отделок и исполнений у большинства моделей",
      "Предметы для взрослых и детских комнат",
      "Серии, которые можно достраивать со временем",
    ],
  },
  kidsBlock: {
    title: "Детская: тепло, но по-взрослому",
    text: [
      "Массив, ручная роспись и спокойные формы",
      "Комната растёт вместе с ребёнком",
      "от первой кроватки до рабочего стола",
    ],
    cta: "Смотреть детскую мебель",
  },
  projectBlock: {
    title: "Нужен не предмет, а интерьер целиком?",
    text: [
      "Подберём модели, цвет, ткань и композицию комнаты",
      "Можно начать с одного предмета",
      "или собрать комнату под ключ",
    ],
    ctaPrimary: "Обсудить проект",
    ctaSecondary: "Мебель по проекту",
  },
  /** Assistive label for the room-scene switcher on the homepage. */
  sceneNav: "Сцены",
  finalCta: {
    title: "Расскажите, какую комнату собираете",
    text: [
      "Подскажем предметы, исполнение и следующий шаг",
      "от готового заказа до проекта целиком",
    ],
    button: "Обсудить проект",
  },
}

export const seo = {
  home: {
    title: "Woodright - мебель из массива для дома и детских комнат",
    description: "Мебель из массива Woodright: готовые модели, детские коллекции, ручная отделка, выбор исполнения и мебель по проекту.",
  },
  catalog: {
    title: "Каталог мебели Woodright - кровати, шкафы, комоды, столы",
    description: "Каталог Woodright: кровати, шкафы, комоды, столы, стеллажи и тумбы из массива. Готовые модели и выбор исполнения.",
  },
  kids: {
    title: "Детская мебель Woodright из массива дерева",
    description: "Детская мебель Woodright: кровати, шкафы, комоды, столы и коллекции с ручной росписью для детской комнаты.",
  },
  kidsCatalog: {
    title: "Каталог детской мебели Woodright",
    description: "Детская мебель Woodright из массива: кровати, шкафы, комоды, столы и стеллажи с ручной росписью.",
  },
  willieWinkieMotifs: {
    title: "Росписи Вилли Винки - детская мебель Woodright",
    description:
      "Художественные росписи Вилли Винки: выберите тему и посмотрите доступную мебель в этой росписи.",
  },
  willieWinkieMotif: (title: string) => ({
    title: `${title} - роспись Вилли Винки | Woodright`,
    description: `Мебель Вилли Винки в росписи ${title}: предметы с подтверждёнными сочетаниями и ручной росписью.`,
  }),
  rooms: {
    title: "Мебель по комнатам Woodright - спальни, детские, кабинеты, гостиные",
    description: "Готовые сочетания мебели Woodright для спальни, детской, кабинета, гостиной и прихожей. Комплект целиком или по предметам.",
  },
  kidsRooms: {
    title: "Детские комнаты Woodright",
    description: "Готовые комплекты детской мебели Woodright - от первых лет до школы, с ручной росписью и массивом дерева.",
  },
  bespoke: {
    title: "Мебель по проекту Woodright - подбор и расчёт для интерьера",
    description: "Мебель Woodright под конкретный интерьер: подбор моделей, отделок и состава комнаты под дизайн-проект или ваши размеры.",
  },
  bespokeCatalog: {
    title: "Каталог по проекту Woodright - кухни, гардеробные, шкафы",
    description: "Мебель Woodright по проекту: кухни, гардеробные, шкафы и другие изделия по индивидуальным размерам.",
  },
  bespokeRequest: {
    title: "Заявка на расчёт Woodright",
    description: "Опишите проект - подготовим расчёт мебели по вашим размерам и отделке и вернёмся с составом и сроками.",
  },
  designersLanding: {
    title: "Дизайнерам и архитекторам - Woodright",
    description:
      "Мебель Woodright для частных и общественных интерьеров: подбор моделей, материалов и исполнений под проект.",
  },
  designersTerms: {
    title: "Woodright для дизайнеров и архитекторов",
    description: "Сотрудничество с дизайнерами и архитекторами: мебель из массива, детские коллекции, отделки и проектные расчёты Woodright.",
  },
  designersMaterials: {
    title: "Материалы для дизайнеров - Woodright",
    description: "Отделки, ткани и варианты исполнения Woodright для проектной работы дизайнеров и архитекторов.",
  },
  designersRequest: {
    title: "Заявка на сотрудничество - Woodright",
    description: "Заявка на сотрудничество с Woodright: подбор мебели, отделок и проектных решений для клиентских интерьеров.",
  },
  about: {
    title: "О бренде Woodright - мебель из массива с характером",
    description: "Woodright делает мебель из массива для взрослых и детских комнат: коллекции, ручная отделка, готовые модели и работа по проекту.",
  },
  aboutMaterials: {
    title: "Материалы и отделки Woodright",
    description: "Материалы мебели Woodright: массив дерева, варианты отделки и ткани для обивки.",
  },
  aboutProduction: {
    title: "Производство Woodright",
    description: "Как рождается мебель Woodright: массив дерева, ручная отделка, готовые и проектные исполнения.",
  },
  contacts: {
    title: "Контакты Woodright",
    description:
      "Контакты Woodright: консультация по каталогу, детской мебели, отделкам и проектным заявкам. Шоурум в Химках, МТК «Гранд-2».",
  },
  privacy: {
    title: "Политика конфиденциальности - Woodright",
    description: "Как Woodright обрабатывает персональные данные покупателей",
  },
  terms: {
    title: "Условия покупки - Woodright",
    description: "Как оформляется заказ на мебель Woodright",
  },
  delivery: {
    title: "Доставка - Woodright",
    description: "Условия доставки мебели Woodright",
  },
  payment: {
    title: "Оплата - Woodright",
    description: "Как оплачивается заказ на мебель Woodright",
  },
  returns: {
    title: "Возврат - Woodright",
    description: "Условия возврата мебели Woodright",
  },
}
