/**
 * Curated media for the Woodright Kids landing (`/kids`), served same-origin
 * via the `/product-static/…` rewrite. All files exist in
 * `apps/backend/static/products` — no external or invented sources.
 *
 * Missing media (tracked, do not fake): kids room interior scenes — the hero
 * uses large product still-lifes on a soft olive field instead.
 */

const P = "/product-static/products"

export const kidsMedia = {
  /** Hero slideshow: Oliver Kids still-lifes (white + olive palette). */
  heroSlides: [
    {
      src: `${P}/oliver/OL-95-1_gallery_02.jpg`,
      alt: "Кровать-трансформер Oliver Kids с оливковой росписью",
    },
    {
      src: `${P}/oliver/OL-85-1_gallery_01.jpg`,
      alt: "Кроватка Oliver Kids для новорождённого",
    },
    {
      src: `${P}/oliver/OL-81-1_gallery_02.jpg`,
      alt: "Детский стол и стул Oliver Kids",
    },
  ],

  /* «С чего начать» entries */
  entryCatalog: `${P}/willie-winkie/fa-05-3-iso.jpg`,
  entryRooms: `${P}/oliver/OL-85-1_gallery_02.jpg`,
  entryProject: `${P}/willie-winkie/rl-67-1-iso.jpg`,

  /**
   * Hand-paint gallery: tight crops of four Willie Winkie paint series.
   * `handle` links the crop to its PDP when the product is in catalog scope.
   */
  paint: [
    {
      src: `${P}/willie-winkie/te-05-3-iso-1_pi5l-lp.jpg`,
      handle: "te-05-3",
      origin: "56% 44%",
      zoom: 1.9,
      alt: "Роспись Templars: замок и рыцари на фасаде комода",
    },
    {
      src: `${P}/willie-winkie/rs-05-3-iso.jpg`,
      handle: "rs-05-3",
      origin: "52% 52%",
      zoom: 1.9,
      alt: "Роспись Rural Scenery: пейзаж с деревьями на фасаде комода",
    },
    {
      src: `${P}/willie-winkie/ba-05-3-i1.png`,
      handle: "ba-05-3",
      origin: "54% 46%",
      zoom: 1.8,
      alt: "Роспись Ballet: балерина и цветочные гирлянды",
    },
    {
      src: `${P}/willie-winkie/pa-05-3-iso_xjox-o6.jpg`,
      handle: "pa-05-3",
      origin: "52% 46%",
      zoom: 1.9,
      alt: "Роспись Pastoral: букеты полевых цветов",
    },
  ],

  /** Finish variants for the kids strip (chair fabrics). */
  stripVariants: {
    "ol-82-1": [
      `${P}/oliver/OL-82-1_color_linda_02.jpg`,
      `${P}/oliver/OL-82-1_color_lorna_02.jpg`,
    ],
  } as Record<string, string[]>,
} as const
