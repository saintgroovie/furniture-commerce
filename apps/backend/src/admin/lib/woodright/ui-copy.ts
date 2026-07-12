/**
 * Package F (F-06/F-07) — short shared Russian dictionary for the Woodright
 * admin UI. Use these constants for recurring nouns/actions instead of
 * retyping them per screen; full sentences stay local to their screens.
 */
export const UI_COPY = {
  product: "Товар",
  products: "Товары",
  variant: "Вариант",
  variants: "Варианты",
  sku: "Артикул (SKU)",
  price: "Цена",
  gallery: "Галерея",
  thumbnail: "Главное фото",
  promotion: "Акция",
  promotions: "Акции",
  campaign: "Кампания",
  campaigns: "Кампании",
  draft: "Черновик",
  published: "Опубликован",
  save: "Сохранить",
  cancel: "Отмена",
  open: "Открыть",
  search: "Поиск",
  soonBadge: "скоро",
  technicalDetails: "Технические сведения",
  dashboardTitle: "Рабочий стол Woodright",
} as const

export type UiCopyKey = keyof typeof UI_COPY
