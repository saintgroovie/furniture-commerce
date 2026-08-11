/**
 * Curated homepage media, served same-origin via the `/product-static/…` →
 * Medusa `/static/…` rewrite (see next.config.js). All files exist in
 * `apps/backend/static/products` — no external or invented sources.
 *
 * Missing media (tracked for the content team, do not fake):
 * - kids room interior scene (section uses a product still-life instead)
 * - wood / hands / workshop macro photography (craft section uses tight
 *   product crops with visible material instead)
 * - hero loop video (hero uses a slow photographic slideshow instead)
 */

const P = "/product-static/products"

export const homeMedia = {
  /**
   * Hero slideshow: three Greenwich interiors, slow cross-fade + drift.
   * Note: wideheader View02 is intentionally NOT used anywhere - its right
   * pillow has a baked-in render artifact (white smudge).
   */
  heroSlides: [
    {
      src: `${P}/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg`,
      alt: "Спальня с кроватью и креслом Greenwich в тёплых тонах",
    },
    {
      src: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View01.jpg`,
      alt: "Спальня Cloud с кроватью и рабочим столом Greenwich",
    },
    {
      src: `${P}/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View03.jpg`,
      alt: "Светлая спальня с кроватью Greenwich и белым гардеробом",
    },
  ],

  /** Light Greenwich bedroom with bed, desk and nightstand — room scene 01. */
  roomSceneGreenwich: `${P}/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View01.jpg`,
  /** 1600×1000 Cloud bedroom with desk and wardrobe wall — room scene 02. */
  roomSceneCloud: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg`,

  /* «С чего начать» photo entries: bed / interior / kids crib / dark vitrine */
  entryCatalog: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_greenwich_cloud_natural_beige.jpg`,
  entryRooms: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg`,
  entryKids: `${P}/oliver/OL-95-1_gallery_02.jpg`,
  entryProject: `${P}/greenwich/GR-26-1_noliver_View19_afqd-bq.jpg`,

  /* Craft section: tight material crops (wood / finishes / handpaint / series) */
  craftWood: `${P}/greenwich/GR-67-1_noliver_View16.jpg`,
  craftFinish: `${P}/greenwich/GR-05-1_greenwich_graphite05.jpg`,
  craftHandpaint: `${P}/oliver/OL-81-1_gallery_02.jpg`,
  craftSeries: `${P}/greenwich/GR-05-1_greenwich_white04.jpg`,

  /**
   * Color/finish variants for the featured strip - same model, different
   * finishes; cards cycle through them over time (and this is what answers
   * «должны быть разные цветовые вариации»).
   */
  featuredVariants: {
    "greenwich-gr-67-1": [
      `${P}/greenwich/GR-67-1_greenwich_olive16.jpg`,
      `${P}/greenwich/GR-67-1_greenwich_graphite16.jpg`,
    ],
    "greenwich-gr-26-1": [
      `${P}/greenwich/GR-26-1_greenwich_green19_n3cg-c5.jpg`,
      `${P}/greenwich/GR-26-1_greenwich_darkblue19_a1fi-rc.jpg`,
    ],
    "greenwich-gr-05-1": [
      `${P}/greenwich/GR-05-1_greenwich_graphite04.jpg`,
      `${P}/greenwich/GR-05-1_greenwich_olive04.jpg`,
    ],
    "greenwich-gr-44-1": [
      `${P}/greenwich/GR-44-1_greenwich_darkblue07_tynd-0c.jpg`,
      `${P}/greenwich/GR-44-1_greenwich_terracote07_suda-hi.jpg`,
    ],
    "greenwich-gr-08-1": [
      `${P}/greenwich/GR-08-1_greenwich_graphite10.jpg`,
      `${P}/greenwich/GR-08-1_greenwich_green10.jpg`,
    ],
  } as Record<string, string[]>,

  /* «По проекту» collage: one model in two finishes + fabric option */
  projectFinishGraphite: `${P}/greenwich/GR-05-1_greenwich_graphite06.jpg`,
  projectFinishWhite: `${P}/greenwich/GR-05-1_greenwich_white05.jpg`,
  projectFabricChair: `${P}/oliver/OL-23-1_color_lillian_01.jpg`,

  /** Final CTA background — bookend echo of the hero interior. */
  finalInterior: `${P}/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg`,
} as const
