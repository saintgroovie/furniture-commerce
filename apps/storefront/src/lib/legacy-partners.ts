/**
 * Buyer-facing partner index from owner-confirmed legacy roster (BES-012)
 * plus two historical cases from owner project PDFs (Kunstkamera, RAN hall).
 * Project photos replace catalog stubs. Names without a PDF stay marks-only.
 */
import type { StorePartner } from "./api/partners"

const E = "/editorial/partners"

function photo(slug: string, file: string): string {
  return `${E}/${slug}/${file}`
}

function slides(
  items: Array<{ file: string; alt: string; title: string; caption: string }>,
  slug: string
): NonNullable<StorePartner["presentations"][number]["slides"]> {
  return items.map((item) => ({
    src: photo(slug, item.file),
    alt: item.alt,
    title: item.title,
    caption: item.caption,
  }))
}

function deck(
  partnerId: string,
  title: string,
  deckSlides: NonNullable<StorePartner["presentations"][number]["slides"]>
): StorePartner["presentations"] {
  return [
    {
      id: `${partnerId}-deck`,
      title,
      file_url: "",
      cover_url: deckSlides[0]?.src ?? null,
      page_count: deckSlides.length,
      mime: "editorial",
      slides: deckSlides,
    },
  ]
}

export const LEGACY_PARTNERS: StorePartner[] = [
  {
    id: "p_bolshoi",
    slug: "bolshoi",
    name: "Большой театр",
    description: "Реставрация кресел зала Новой сцены",
    logo_url: photo("bolshoi", "logo.jpg"),
    website_url: null,
    featured: true,
    sort_order: 10,
    is_active: true,
    images: [
      photo("bolshoi", "hall.jpg"),
      photo("bolshoi", "stalls.jpg"),
      photo("bolshoi", "chairs-pattern.jpg"),
      photo("bolshoi", "chairs-velvet.jpg"),
    ],
    presentations: deck(
      "p_bolshoi",
      "Реставрация кресел зала",
      slides(
        [
          {
            file: "hall.jpg",
            alt: "Зрительный зал Новой сцены Большого театра с рядами кресел",
            title: "Новая сцена",
            caption: "Реставрация мебели и кресел зрительного зала",
          },
          {
            file: "stalls.jpg",
            alt: "Кресла партера Новой сцены Большого театра",
            title: "Партер",
            caption: "Кресла зала после реставрации",
          },
          {
            file: "chairs-pattern.jpg",
            alt: "Крупный план спинок кресел с тканью и массивом",
            title: "Спинка и ткань",
            caption: "Массив и обивка в классе исторического зала",
          },
          {
            file: "chairs-velvet.jpg",
            alt: "Бархатные кресла с гвоздевой отделкой у лестницы зала",
            title: "Кресло зала",
            caption: "Ручная отделка сидений и спинок",
          },
        ],
        "bolshoi"
      )
    ),
  },
  {
    id: "p_vgbll",
    slug: "vgbll",
    name: "ВГБИЛ им. М. И. Рудомино",
    description: "Проектирование и изготовление мебели",
    logo_url: "/editorial/partners/vgbll.svg",
    website_url: null,
    featured: false,
    sort_order: 20,
    is_active: true,
    images: [],
    presentations: [],
  },
  {
    id: "p_sochi",
    slug: "sochi",
    name: "Городское собрание Сочи",
    description: "Конференц-зал: стол, трибуна, комплект",
    logo_url: "/editorial/partners/sochi.svg",
    website_url: null,
    featured: false,
    sort_order: 30,
    is_active: true,
    images: [],
    presentations: [],
  },
  {
    id: "p_mvd",
    slug: "mvd-academy",
    name: "Академия управления МВД",
    description: "Центральная библиотека - полный цикл",
    logo_url: "/editorial/partners/mvd-academy.png",
    website_url: null,
    featured: false,
    sort_order: 40,
    is_active: true,
    images: [
      photo("mvd-academy", "reading-room.jpg"),
      photo("mvd-academy", "tables.jpg"),
      photo("mvd-academy", "catalog.jpg"),
      photo("mvd-academy", "digital.jpg"),
    ],
    presentations: deck(
      "p_mvd",
      "Центральная библиотека",
      slides(
        [
          {
            file: "reading-room.jpg",
            alt: "Читальный зал библиотеки Академии управления МВД",
            title: "Читальный зал",
            caption: "Массив дуба, кожа и полный цикл от проекта до монтажа",
          },
          {
            file: "tables.jpg",
            alt: "Столы с кожаными столешницами и книжные шкафы",
            title: "Столы и шкафы",
            caption: "Мебель для длительной работы с книгой",
          },
          {
            file: "catalog.jpg",
            alt: "Карточный каталог и рабочие столы библиотеки",
            title: "Каталог",
            caption: "Столярная работа для исторической библиотеки",
          },
          {
            file: "digital.jpg",
            alt: "Рабочие места библиотеки с деревянными столами и шкафами",
            title: "Рабочие места",
            caption: "Дуб, кожа, витраж и бронза в одном зале",
          },
        ],
        "mvd-academy"
      )
    ),
  },
  {
    id: "p_mariinsky",
    slug: "mariinsky-palace",
    name: "Мариинский дворец",
    description: "Гардероб, музейное оборудование, вестибюль",
    logo_url: "/editorial/partners/mariinsky-palace.svg",
    website_url: null,
    featured: true,
    sort_order: 50,
    is_active: true,
    images: [
      photo("mariinsky-palace", "vitrines.jpg"),
      photo("mariinsky-palace", "wardrobe.jpg"),
      photo("mariinsky-palace", "wardrobe-inner.jpg"),
      photo("mariinsky-palace", "benches.jpg"),
    ],
    presentations: deck(
      "p_mariinsky",
      "Полный цикл",
      slides(
        [
          {
            file: "vitrines.jpg",
            alt: "Музейные витрины в коридоре Мариинского дворца",
            title: "Музейное оборудование",
            caption: "Витрины по заказу Законодательного собрания Санкт-Петербурга",
          },
          {
            file: "wardrobe.jpg",
            alt: "Гардероб Мариинского дворца с колоннами и золочением",
            title: "Гардероб",
            caption: "Бук, МДФ, камень, стекло, бронза, роспись и золочение",
          },
          {
            file: "wardrobe-inner.jpg",
            alt: "Внутреннее пространство гардероба с крючками и зеркалами",
            title: "Гардероб изнутри",
            caption: "Чертежи, изготовление и монтаж в одном цикле",
          },
          {
            file: "benches.jpg",
            alt: "Скамьи вестибюля Мариинского дворца",
            title: "Вестибюль",
            caption: "Скамьи в мраморе, камне и золочении",
          },
        ],
        "mariinsky-palace"
      )
    ),
  },
  {
    id: "p_sovcomflot",
    slug: "sovcomflot",
    name: "ПАО «Совкомфлот»",
    description: "Зал заседаний совета директоров",
    logo_url: "/editorial/partners/sovcomflot.png",
    website_url: null,
    featured: false,
    sort_order: 60,
    is_active: true,
    images: [],
    presentations: [],
  },
  {
    id: "p_tver",
    slug: "tver-gallery",
    name: "Тверская картинная галерея",
    description: "Музейные витрины и постаменты",
    logo_url: "/editorial/partners/tver-gallery.svg",
    website_url: null,
    featured: false,
    sort_order: 70,
    is_active: true,
    images: [],
    presentations: [],
  },
  {
    id: "p_kunstkamera",
    slug: "kunstkamera",
    name: "Кунсткамера РАН",
    description: "Музейное оборудование экспозиции",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 80,
    is_active: true,
    images: [
      photo("kunstkamera", "expeditions.jpg"),
      photo("kunstkamera", "northern.jpg"),
      photo("kunstkamera", "physics.jpg"),
      photo("kunstkamera", "circumnavigation.jpg"),
    ],
    presentations: deck(
      "p_kunstkamera",
      "Башня знаний",
      slides(
        [
          {
            file: "expeditions.jpg",
            alt: "Музейная витрина Экспедиции в Кунсткамере РАН",
            title: "Экспедиции",
            caption: "Витрины экспозиции «Петровская Кунсткамера, или Башня знаний»",
          },
          {
            file: "northern.jpg",
            alt: "Витрина Великой Северной экспедиции в Кунсткамере",
            title: "Великая Северная экспедиция",
            caption: "Музейное оборудование для показа экспедиций",
          },
          {
            file: "physics.jpg",
            alt: "Витрина физических экспедиций Палласа и Георга в Кунсткамере",
            title: "Физические экспедиции",
            caption: "Массив, стекло и встроенный показ",
          },
          {
            file: "circumnavigation.jpg",
            alt: "Круговой зал Кунсткамеры с витринами и дубовыми рамами",
            title: "Кругосветная экспедиция",
            caption: "Оборудование экспозиции МАЭ РАН",
          },
        ],
        "kunstkamera"
      )
    ),
  },
  {
    id: "p_ran",
    slug: "ran-presidential",
    name: "Президентский зал РАН",
    description: "Столы, трибуны и кресла зала",
    logo_url: null,
    website_url: null,
    featured: false,
    sort_order: 90,
    is_active: true,
    images: [
      photo("ran-presidential", "hall.jpg"),
      photo("ran-presidential", "desks.jpg"),
      photo("ran-presidential", "tribune.jpg"),
      photo("ran-presidential", "chairs.jpg"),
    ],
    presentations: deck(
      "p_ran",
      "Президентский зал",
      slides(
        [
          {
            file: "hall.jpg",
            alt: "Президентский зал РАН со столами президиума и креслами",
            title: "Зал",
            caption: "Столы, трибуны и кресла - сталь, дуб и кожа",
          },
          {
            file: "desks.jpg",
            alt: "Столы заседаний Президентского зала РАН",
            title: "Столы",
            caption: "Комплект столов президиума и заседания",
          },
          {
            file: "tribune.jpg",
            alt: "Трибуна и рабочий стол Президентского зала РАН",
            title: "Трибуна",
            caption: "Трибуна и кресла для президиума",
          },
          {
            file: "chairs.jpg",
            alt: "Кресла слушателей Президентского зала РАН",
            title: "Кресла",
            caption: "Кресла зала и стол стенографистов",
          },
        ],
        "ran-presidential"
      )
    ),
  },
]
