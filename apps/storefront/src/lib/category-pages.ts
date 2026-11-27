import { parseCatalogFilterState, type CatalogSearchParams } from "./catalog-filter-params"
import { getProductCategoryKey } from "./catalog-filters"
export const CATEGORY_PAGES = [
  {
    "h1": "Кровати Woodright",
    "title": "Кровати Woodright - модели и характеристики",
    "description": "Кровати Woodright: выберите модель и сравните размеры, исполнение и стоимость в карточках товаров. Условия заказа помогут уточнить менеджеры.",
    "intro": "Подберите кровать для вашей комнаты. В карточках моделей собраны характеристики, варианты исполнения и стоимость. Уточните спальное место и внешний размер: это поможет оценить, как кровать разместится в комнате.",
    "main_cta": "Выбрать модель",
    "secondary_cta": "Помочь с выбором",
    "internal_links": [
      "/catalog",
      "/about/materials",
      "/delivery",
      "/contacts"
    ],
    "path": "/catalog/krovati",
    "scope": "main",
    "slug": "krovati"
  },
  {
    "h1": "Шкафы Woodright",
    "title": "Шкафы Woodright - модели и характеристики",
    "description": "Шкафы Woodright для одежды, посуды и кабинета: сравните назначение, размеры и варианты исполнения моделей. Характеристики смотрите в карточках товаров.",
    "intro": "В подборке представлены гардеробы, шкафы-витрины, буфетные и кабинетные модели. Сначала определите, что нужно хранить, затем сравните габариты и внутреннее устройство подходящих шкафов. Варианты исполнения и стоимость уточняйте в карточке модели.",
    "main_cta": "Выбрать модель",
    "secondary_cta": "Помочь с выбором",
    "internal_links": [
      "/catalog",
      "/about/materials",
      "/delivery",
      "/contacts"
    ],
    "path": "/catalog/shkafy",
    "scope": "main",
    "slug": "shkafy"
  },
  {
    "h1": "Комоды Woodright",
    "title": "Комоды Woodright - модели и характеристики",
    "description": "Комоды Woodright: модели для хранения, характеристики, размеры и доступные варианты исполнения. Выберите комод в каталоге.",
    "intro": "Сравните ширину и глубину комодов, количество ящиков и устройство хранения. Перед выбором оставьте перед комодом пространство для открывания ящиков. Размеры и доступное исполнение смотрите в карточке модели.",
    "main_cta": "Выбрать модель",
    "secondary_cta": "Помочь с выбором",
    "internal_links": [
      "/catalog",
      "/about/materials",
      "/delivery",
      "/contacts"
    ],
    "path": "/catalog/komody",
    "scope": "main",
    "slug": "komody"
  },
  {
    "h1": "Столы Woodright",
    "title": "Столы Woodright - модели и характеристики",
    "description": "Столы Woodright: письменные, рабочие, обеденные и туалетные модели. Сравните назначение, размеры и варианты исполнения в карточках товаров.",
    "intro": "В подборке есть столы для работы и кабинета, обеденный стол и туалетный столик. Выберите назначение, затем сравните размеры столешницы и внешние габариты. Ящики, тумбы и другие элементы хранения проверяйте у выбранной модели.",
    "main_cta": "Выбрать модель",
    "secondary_cta": "Помочь с выбором",
    "internal_links": [
      "/catalog",
      "/about/materials",
      "/delivery",
      "/contacts"
    ],
    "path": "/catalog/stoly",
    "scope": "main",
    "slug": "stoly"
  },
  {
    "h1": "Детские кровати Woodright",
    "title": "Детские кровати Woodright - модели и характеристики",
    "description": "Детские кровати Woodright: сравните модели, размеры и варианты исполнения. Уточните характеристики выбранной кровати перед заказом.",
    "intro": "В подборке есть кроватки для новорождённых, детские кровати и модели-трансформеры. Сравните размер спального места, внешние габариты и особенности конкретной модели. Бортики, ящики и дополнительные элементы не предполагаются по умолчанию - проверьте их наличие в карточке и при обсуждении заказа.",
    "main_cta": "Выбрать модель",
    "secondary_cta": "Помочь с выбором",
    "internal_links": [
      "/catalog",
      "/about/materials",
      "/delivery",
      "/contacts"
    ],
    "path": "/kids/catalog/krovati",
    "scope": "kids",
    "slug": "krovati"
  }
] as const
export type CategoryPage = typeof CATEGORY_PAGES[number]
export type CategoryScope = "main" | "kids"
export function categoryPage(scope: CategoryScope, slug: string) {
  return CATEGORY_PAGES.find(row => row.scope === scope && row.slug === slug)
}
export function categoryProducts(products: Record<string, unknown>[], page: CategoryPage) {
  return products.filter(product => getProductCategoryKey(product) === page.slug)
}
export function categoryQuery(page: CategoryPage, query: CatalogSearchParams) {
  return { ...parseCatalogFilterState(query), category: [page.slug] }
}
export function nonemptyCategoryPages(scope: CategoryScope, products: Record<string, unknown>[]) {
  return CATEGORY_PAGES.filter(page => page.scope === scope && categoryProducts(products, page).length > 0)
}
