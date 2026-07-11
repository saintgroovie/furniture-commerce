/**
 * Narrow Package A1 copy — only strings used by system states, mobile a11y,
 * designers entry, and checkout clarity. Not a site-wide copy framework.
 */
export const a1Nav = {
  catalog: "Каталог",
  rooms: "Комнаты",
  kids: "Детская",
  bespoke: "По проекту",
  about: "О бренде",
  designers: "Дизайнерам",
  contacts: "Контакты",
  cart: "Корзина",
} as const

export const a1A11y = {
  skipToContent: "Перейти к содержимому",
  openMenu: "Открыть меню",
  closeMenu: "Закрыть меню",
  mobileNavLabel: "Мобильная навигация",
} as const

export const a1System = {
  notFound: {
    label: "404",
    title: "Страница не найдена",
    body: "Возможно, ссылка устарела или страница была перемещена. Перейдите в каталог или вернитесь на главную.",
    ctaPrimary: "Перейти в каталог",
    ctaSecondary: "На главную",
  },
  error: {
    title: "Не удалось загрузить страницу",
    body: "Попробуйте обновить страницу. Если ошибка повторится, вернитесь в каталог.",
    ctaPrimary: "Попробовать снова",
    ctaSecondary: "Перейти в каталог",
  },
  loading: {
    label: "Загружаем…",
  },
} as const

export const a1Designers = {
  eyebrow: "Дизайнерам и архитекторам",
  h1: "Мебель для частных и общественных интерьеров",
  lead:
    "Помогаем подобрать модели, материалы и исполнения под интерьерный проект. Для нестандартных задач можно отправить описание проекта и получить обратную связь от команды Woodright.",
  ctaPrimary: "Обсудить проект",
  ctaSecondary: "Перейти в каталог",
  title: "Дизайнерам и архитекторам — Woodright",
  description:
    "Мебель Woodright для частных и общественных интерьеров: подбор моделей, материалов и исполнений под проект.",
} as const

export const a1Checkout = {
  paymentClarity:
    "Сейчас оплачивать заказ не нужно. После оформления менеджер подтвердит состав заказа, согласует доставку и пришлёт ссылку на оплату.",
  submit: "Отправить заказ",
  submitting: "Отправляем…",
  successTitle: "Заказ отправлен на подтверждение",
  successBody:
    "Заказ отправлен на подтверждение. Менеджер свяжется с вами, уточнит детали и пришлёт ссылку на оплату.",
} as const
