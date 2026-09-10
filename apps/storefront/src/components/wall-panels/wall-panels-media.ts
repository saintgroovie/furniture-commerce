/**
 * Curated visual set for «По проекту → Стеновые панели» (`/bespoke/wall-panels`),
 * served from `apps/storefront/public/bespoke/panels/` (+ two shared frames
 * from `public/bespoke/`).
 *
 * PROVENANCE: every frame here is an AI-generated art-direction visual made
 * for this prototype. None is a photograph of a built Woodright object. The
 * page discloses this in the hero (`wallPanelsCopy.hero.visualsNote`). Replace
 * with real project photography when it exists; keep the same keys so the
 * page layout does not change.
 *
 * Each frame explains one idea and is used once, except the two shared
 * `/bespoke/*.jpg` frames that already illustrate the Bespoke hub.
 */

const P = "/bespoke/panels"
const B = "/bespoke"

export type WallPanelFrame = {
  src: string
  alt: string
  /** object-position for cover crops; defaults to center. */
  pos?: string
  /** Intrinsic ratio, used to reserve layout before the image decodes. */
  ratio: "3:2" | "2:3" | "1:1" | "4:3"
}

export const wallPanelsMedia = {
  hero: {
    src: `${P}/hero.jpg`,
    alt: "Гостиная со стеной из широких вертикальных панелей светлого дуба и низкой тумбой из ореха",
    pos: "50% 50%",
    ratio: "3:2",
  },

  /** Material Explorer: primary frame + macro / interior counterpart per direction. */
  materials: {
    wood: {
      main: {
        src: `${P}/mat-wood-light.jpg`,
        alt: "Панели светлого дуба с подобранной текстурой, теневой шов между модулями",
        ratio: "2:3",
      },
      alt: {
        src: `${P}/mat-wood-dark.jpg`,
        alt: "Стена из тёмного ореха с латунным светильником, свет проявляет текстуру",
        ratio: "2:3",
      },
    },
    paint: {
      main: {
        src: `${P}/mat-paint.jpg`,
        alt: "Окрашенные панели тёплого серо-бежевого тона с неглубокими рамками, скамья из дуба",
        ratio: "2:3",
      },
      alt: {
        src: `${B}/hero-panels.jpg`,
        alt: "Гостиная с окрашенными стеновыми панелями и комодом из массива ореха",
        pos: "58% 50%",
        ratio: "3:2",
      },
    },
    relief: {
      main: {
        src: `${P}/mat-relief.jpg`,
        alt: "Рельефная панель из светлого дерева с широкими волнами фрезеровки при боковом свете",
        ratio: "2:3",
      },
      alt: {
        src: `${P}/det-fluted.jpg`,
        alt: "Макро каннелюр из дуба: глубокие тени между рёбрами",
        ratio: "2:3",
      },
    },
    soft: {
      main: {
        src: `${P}/mat-soft.jpg`,
        alt: "Спальня с мягкими текстильными панелями в тонких дубовых рамках за кроватью",
        ratio: "2:3",
      },
      alt: null,
    },
    combined: {
      main: {
        src: `${P}/mat-combined.jpg`,
        alt: "Стена из ореховых панелей рядом с окрашенной оливковой плоскостью и тонким металлическим швом",
        ratio: "2:3",
      },
      alt: {
        src: `${P}/det-joint.jpg`,
        alt: "Макро стыка: ореховая панель встречается с окрашенной поверхностью через теневой шов",
        ratio: "1:1",
      },
    },
  } satisfies Record<
    string,
    { main: WallPanelFrame; alt: WallPanelFrame | null }
  >,

  /** «Рисунок»: five distinct geometries, frontal, near-abstract. */
  pattern: {
    vertical: {
      src: `${P}/pat-vertical.jpg`,
      alt: "Стена из узких вертикальных дубовых реек на тёмной подложке",
      ratio: "1:1",
    },
    horizontal: {
      src: `${P}/pat-horizontal.jpg`,
      alt: "Широкие горизонтальные панели серо-коричневого дуба разной ширины",
      ratio: "1:1",
    },
    modules: {
      src: `${P}/pat-modules.jpg`,
      alt: "Крупные квадратные модули выбеленного дуба с тонкими теневыми швами",
      ratio: "1:1",
    },
    geometry: {
      src: `${P}/pat-geometry.jpg`,
      alt: "Асимметричная раскладка прямоугольников в трёх тонах дерева",
      ratio: "1:1",
    },
    symmetry: {
      src: `${P}/pat-symmetry.jpg`,
      alt: "Симметричная классическая композиция окрашенных панелей с тонкими рамками",
      ratio: "1:1",
    },
  } satisfies Record<string, WallPanelFrame>,

  /** «Масштаб»: one oak, same light and floor, three rhythms. */
  scale: {
    narrow: {
      src: `${P}/scale-narrow.jpg`,
      alt: "Стена из частых узких дубовых панелей во всю высоту",
      ratio: "2:3",
    },
    medium: {
      src: `${P}/scale-medium.jpg`,
      alt: "Стена из дубовых панелей средней ширины, пять модулей",
      ratio: "2:3",
    },
    monumental: {
      src: `${P}/scale-monumental.jpg`,
      alt: "Стена из двух очень широких дубовых панелей с одним швом",
      ratio: "2:3",
    },
  } satisfies Record<string, WallPanelFrame>,

  /** «Детали»: macro gallery. */
  details: {
    grain: {
      src: `${P}/det-grain.jpg`,
      alt: "Макро текстуры дубового шпона при боковом свете",
      ratio: "1:1",
    },
    joint: {
      src: `${P}/det-joint.jpg`,
      alt: "Макро теневого шва между ореховой и окрашенной панелью",
      ratio: "1:1",
    },
    fluted: {
      src: `${P}/det-fluted.jpg`,
      alt: "Макро каннелюр: свет и тень на рёбрах дуба",
      ratio: "2:3",
    },
    corner: {
      src: `${P}/det-corner.jpg`,
      alt: "Внутренний угол: каннелюры переходят в гладкие дубовые панели",
      ratio: "1:1",
    },
    transition: {
      src: `${P}/det-transition.jpg`,
      alt: "Переход ореховой стеновой панели во фронт встроенной тумбы с латунной ручкой",
      ratio: "1:1",
    },
  } satisfies Record<string, WallPanelFrame>,

  /** «Панели как часть интерьера»: wall → door → furniture → whole room. */
  interior: {
    wall: {
      src: `${P}/int-wall.jpg`,
      alt: "Гостиная с одной стеной из крупных окрашенных панелей терракотового тона",
      ratio: "3:2",
    },
    door: {
      src: `${P}/int-door.jpg`,
      alt: "Коридор с дубовыми панелями, дверь выполнена в той же плоскости и рисунке",
      ratio: "3:2",
    },
    furniture: {
      src: `${B}/final-hallway.jpg`,
      alt: "Прихожая со встроенным шкафом и стеновыми панелями в оливковом цвете",
      pos: "50% 55%",
      ratio: "3:2",
    },
    whole: {
      src: `${P}/int-whole.jpg`,
      alt: "Столовая, где ореховые панели, встроенная тумба и стол выполнены в одном материале",
      ratio: "3:2",
    },
  } satisfies Record<string, WallPanelFrame>,

  /** «Для разных пространств». */
  spaces: {
    living: {
      src: `${P}/sp-living.jpg`,
      alt: "Гостиная с одной спокойной стеной из широких дубовых панелей и льняным диваном",
      pos: "50% 45%",
      ratio: "3:2",
    },
    bedroom: {
      src: `${P}/sp-bedroom.jpg`,
      alt: "Спальня со стеной из широких горизонтальных панелей выбеленного ясеня",
      ratio: "3:2",
    },
    office: {
      src: `${P}/sp-office.jpg`,
      alt: "Кабинет с тёмными каннелюрами и встроенными полками из того же дерева",
      ratio: "4:3",
    },
    public: {
      src: `${P}/sp-public.jpg`,
      alt: "Лобби с двусветной стеной из широких дубовых панелей и стойкой ресепшен",
      ratio: "3:2",
    },
  } satisfies Record<string, WallPanelFrame>,

  final: {
    src: `${P}/final.jpg`,
    alt: "Пустая комната в сумерках со стеной из тёмных дубовых панелей разной ширины",
    pos: "50% 50%",
    ratio: "3:2",
  },
} as const

/** Reserve space before decode; keeps CLS at zero for the editorial grids. */
export function frameAspect(ratio: WallPanelFrame["ratio"]): string {
  switch (ratio) {
    case "3:2":
      return "3 / 2"
    case "2:3":
      return "2 / 3"
    case "4:3":
      return "4 / 3"
    default:
      return "1 / 1"
  }
}

/** Request form entry from this page - section + task preselect. */
export const WALL_PANELS_REQUEST_HREF = `/bespoke/request?section=${encodeURIComponent(
  "Стеновые панели"
)}&task=wall_panels`
