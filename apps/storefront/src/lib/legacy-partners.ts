/**
 * Buyer-facing partner index from owner-confirmed legacy roster (BES-012).
 * Names and work captions come from FACT_LEDGER + BESPOKE_POSITIONING.
 * No third-party logo files exist in the repo - marks are typographic.
 */
import { editorialMedia } from "./editorial-media"
import type { StorePartner } from "./api/partners"

const P = "/product-static/products"

function deck(
  partnerId: string,
  title: string,
  slides: NonNullable<StorePartner["presentations"][number]["slides"]>
): StorePartner["presentations"] {
  return [
    {
      id: `${partnerId}-deck`,
      title,
      file_url: "",
      cover_url: slides[0]?.src ?? null,
      page_count: slides.length,
      mime: "editorial",
      slides,
    },
  ]
}

export const LEGACY_PARTNERS: StorePartner[] = [
  {
    id: "p_bolshoi",
    slug: "bolshoi",
    name: "Большой театр",
    description: "Реставрация кресел зала",
    logo_url: null,
    website_url: null,
    featured: true,
    sort_order: 10,
    is_active: true,
    images: [editorialMedia.aboutHero.src, editorialMedia.aboutDetail.src],
    presentations: deck("p_bolshoi", "Реставрация кресел зала", [
      {
        src: editorialMedia.aboutHero.src,
        alt: editorialMedia.aboutHero.alt,
        title: "Большой театр",
        caption: "Реставрация предметов интерьера и кресел зрительного зала",
      },
      {
        src: editorialMedia.aboutDetail.src,
        alt: editorialMedia.aboutDetail.alt,
        title: "Массив и отделка",
        caption: "Ремесленная реставрация в классе исторического интерьера",
      },
      {
        src: editorialMedia.productionWood.src,
        alt: editorialMedia.productionWood.alt,
        title: "Производство",
        caption: "Собственное производство Woodright - от массива до ручной отделки",
      },
    ]),
  },
  {
    id: "p_vgbll",
    slug: "vgbll",
    name: "ВГБИЛ им. М. И. Рудомино",
    description: "Проектирование и изготовление мебели",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 20,
    is_active: true,
    images: [editorialMedia.designersWide.src],
    presentations: deck("p_vgbll", "Библиотека иностранной литературы", [
      {
        src: editorialMedia.designersWide.src,
        alt: editorialMedia.designersWide.alt,
        title: "ВГБИЛ",
        caption: "Проектирование и изготовление мебели для библиотеки",
      },
      {
        src: editorialMedia.productionLead.src,
        alt: editorialMedia.productionLead.alt,
        title: "Реставрация",
        caption: "Отдельно - реставрация предметов интерьера",
      },
      {
        src: editorialMedia.materialsGraphite.src,
        alt: editorialMedia.materialsGraphite.alt,
        title: "Отделка",
        caption: "Графит и массив в спокойной классике",
      },
    ]),
  },
  {
    id: "p_sochi",
    slug: "sochi",
    name: "Городское собрание Сочи",
    description: "Конференц-зал: стол, трибуна, комплект",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 30,
    is_active: true,
    images: [editorialMedia.contactsMaterial.src],
    presentations: deck("p_sochi", "Конференц-зал", [
      {
        src: editorialMedia.contactsMaterial.src,
        alt: editorialMedia.contactsMaterial.alt,
        title: "Сочи",
        caption: "Конференц-зал: стол, трибуна и комплект мебели",
      },
      {
        src: editorialMedia.designersHero.src,
        alt: editorialMedia.designersHero.alt,
        title: "Комплект",
        caption: "Предметы собираются в одно пространство заседания",
      },
      {
        src: editorialMedia.materialsWhite.src,
        alt: editorialMedia.materialsWhite.alt,
        title: "Светлый фасад",
        caption: "Спокойная отделка для представительского зала",
      },
    ]),
  },
  {
    id: "p_mvd",
    slug: "mvd-academy",
    name: "Академия управления МВД",
    description: "Историческая библиотека",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 40,
    is_active: true,
    images: [editorialMedia.materialsOlive.src],
    presentations: deck("p_mvd", "Библиотеки", [
      {
        src: editorialMedia.materialsOlive.src,
        alt: editorialMedia.materialsOlive.alt,
        title: "Академия управления МВД",
        caption: "Мебель для исторической библиотеки",
      },
      {
        src: editorialMedia.aboutInterior.src,
        alt: editorialMedia.aboutInterior.alt,
        title: "Интерьер",
        caption: "Предметы для длительной работы с книгой и архивом",
      },
      {
        src: editorialMedia.productionWood.src,
        alt: editorialMedia.productionWood.alt,
        title: "Массив",
        caption: "Оливковая отделка и плотная столярная работа",
      },
    ]),
  },
  {
    id: "p_mariinsky",
    slug: "mariinsky-palace",
    name: "Мариинский дворец",
    description: "Чертежи, изготовление, монтаж",
    logo_url: null,
    website_url: null,
    featured: true,
    sort_order: 50,
    is_active: true,
    images: [editorialMedia.aboutInterior.src, editorialMedia.materialsFabric.src],
    presentations: deck("p_mariinsky", "Полный цикл", [
      {
        src: editorialMedia.aboutInterior.src,
        alt: editorialMedia.aboutInterior.alt,
        title: "Мариинский дворец",
        caption: "От чертежей и эскизов до изготовления и монтажа",
      },
      {
        src: editorialMedia.productionPaint.src,
        alt: editorialMedia.productionPaint.alt,
        title: "Сложные техники",
        caption: "Бук, отделка, роспись - исторический класс работы",
      },
      {
        src: editorialMedia.aboutDetail.src,
        alt: editorialMedia.aboutDetail.alt,
        title: "Деталь",
        caption: "Крупный план массива и фасада",
      },
    ]),
  },
  {
    id: "p_sovcomflot",
    slug: "sovcomflot",
    name: "ПАО «Совкомфлот»",
    description: "Зал заседаний совета директоров",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 60,
    is_active: true,
    images: [`${P}/greenwich/GR-26-1_greenwich_darkblue19_a1fi-rc.jpg`],
    presentations: deck("p_sovcomflot", "Зал заседаний", [
      {
        src: `${P}/greenwich/GR-26-1_greenwich_darkblue19_a1fi-rc.jpg`,
        alt: "Витрина Greenwich в тёмно-синей отделке",
        title: "Совкомфлот",
        caption: "Зал заседаний совета директоров",
      },
      {
        src: editorialMedia.productionLead.src,
        alt: editorialMedia.productionLead.alt,
        title: "Графит",
        caption: "Сдержанная отделка для переговорного зала",
      },
      {
        src: editorialMedia.partnersAtmosphere.src,
        alt: editorialMedia.partnersAtmosphere.alt,
        title: "Пространство",
        caption: "Мебель собирает стол, хранение и рабочую зону",
      },
    ]),
  },
  {
    id: "p_tver",
    slug: "tver-gallery",
    name: "Тверская картинная галерея",
    description: "Музейные витрины и постаменты",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 70,
    is_active: true,
    images: [editorialMedia.materialsWhite.src],
    presentations: deck("p_tver", "Музейное оборудование", [
      {
        src: editorialMedia.materialsWhite.src,
        alt: editorialMedia.materialsWhite.alt,
        title: "Тверская картинная галерея",
        caption: "Витрины, постаменты и мебель представительских помещений",
      },
      {
        src: editorialMedia.designersWide.src,
        alt: editorialMedia.designersWide.alt,
        title: "Экспозиция",
        caption: "Оборудование для показа и хранения",
      },
      {
        src: editorialMedia.aboutDetail.src,
        alt: editorialMedia.aboutDetail.alt,
        title: "Дуб и фасад",
        caption: "Плотная столярная работа для музейного зала",
      },
    ]),
  },
]
