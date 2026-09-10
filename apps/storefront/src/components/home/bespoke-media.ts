/**
 * Curated media for the «По проекту» hub (`/bespoke`), served from
 * `apps/storefront/public/bespoke/` and `public/bespoke/wall-panels/`.
 *
 * PROVENANCE: AI-generated editorial visuals of the direction (panelled
 * interiors, material macros, workshop) - the media library has no real
 * photography of the bespoke process yet. The hero discloses this
 * («Редакционный визуал направления»). Replace with real shoots when
 * available; keep the keys so layout does not change.
 */

const B = "/bespoke"
const W = "/bespoke/wall-panels"

export type BespokeFrame = {
  src: string
  alt: string
  /** object-position for cover crops; defaults to center. */
  pos?: string
}

export const bespokeMedia = {
  /** Hero: oak-panelled living room with a low walnut console. */
  hero: {
    src: `${W}/wp-hero.jpg`,
    alt: "Гостиная со стеной из широких дубовых панелей и низкой тумбой из ореха",
    pos: "50% 55%",
  } satisfies BespokeFrame,

  /** Direction cards, by `bespokeLanding.directions.cards[].id`. */
  directions: {
    furniture: {
      src: `${W}/wp-furniture.jpg`,
      alt: "Встроенная стенка из дуба с низкой тумбой во всю ширину комнаты",
      pos: "50% 50%",
    },
    "wall-panels": {
      src: `${W}/wp-relief.jpg`,
      alt: "Коридор с рельефной стеной из вертикальных ореховых реек",
      pos: "50% 50%",
    },
  } satisfies Record<string, BespokeFrame>,

  /** Material grid, by `bespokeLanding.materials.cards[].id`. */
  materials: {
    grain: {
      src: `${W}/wp-macro-grain.jpg`,
      alt: "Макро текстуры массива дуба при боковом свете",
    },
    joint: {
      src: `${W}/wp-macro-joint.jpg`,
      alt: "Макро стыка двух панелей: точная кромка и теневой шов",
    },
    samples: {
      src: `${B}/samples.jpg`,
      alt: "Образцы отделок массива и ткани на столе рядом с планом комнаты",
      pos: "50% 45%",
    },
    relief: {
      src: `${W}/wp-narrow.jpg`,
      alt: "Стена из частых узких дубовых реек во всю высоту",
    },
    craft: {
      src: `${B}/craftsman.jpg`,
      alt: "Мастер строгает дубовую филёнку ручным рубанком",
      pos: "50% 45%",
    },
  } satisfies Record<string, BespokeFrame>,

  /** Final CTA: hallway with built-in olive wardrobe and wall panelling. */
  final: {
    src: `${B}/final-hallway.jpg`,
    alt: "Прихожая со встроенным шкафом и стеновыми панелями в оливковом цвете",
    pos: "50% 55%",
  } satisfies BespokeFrame,
} as const
