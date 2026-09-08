/**
 * Curated editorial media for brand / service pages.
 * Same-origin `/product-static/…` product photography already used on home.
 * No stock, no invented workshop reportage.
 */

const P = "/product-static/products"

export const editorialMedia = {
  aboutHero: {
    src: `${P}/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg`,
    alt: "Спальня с кроватью Greenwich и креслом в тёплых тонах",
  },
  aboutInterior: {
    src: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg`,
    alt: "Спальня Cloud с кроватью, столом и шкафом Greenwich",
  },
  aboutDetail: {
    src: `${P}/greenwich/GR-67-1_noliver_View16.jpg`,
    alt: "Крупный план массива и фасада комода Greenwich",
  },
  productionLead: {
    src: `${P}/greenwich/GR-05-1_greenwich_graphite05.jpg`,
    alt: "Графитовая отделка фасада Greenwich",
  },
  productionWood: {
    src: `${P}/greenwich/GR-67-1_greenwich_olive16.jpg`,
    alt: "Оливковая отделка массива Greenwich",
  },
  productionPaint: {
    src: `${P}/oliver/OL-81-1_gallery_02.jpg`,
    alt: "Детский комод Oliver с ручной росписью",
  },
  materialsOlive: {
    src: `${P}/greenwich/GR-05-1_greenwich_olive04.jpg`,
    alt: "Оливковый фасад Greenwich",
  },
  materialsGraphite: {
    src: `${P}/greenwich/GR-05-1_greenwich_graphite04.jpg`,
    alt: "Графитовый фасад Greenwich",
  },
  materialsWhite: {
    src: `${P}/greenwich/GR-05-1_greenwich_white04.jpg`,
    alt: "Светлый фасад Greenwich",
  },
  materialsFabric: {
    src: `${P}/oliver/OL-23-1_color_lillian_01.jpg`,
    alt: "Кресло Oliver в ткани",
  },
  designersHero: {
    src: `${P}/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View01.jpg`,
    alt: "Светлая спальня Greenwich с кроватью и тумбой",
  },
  designersWide: {
    src: `${P}/greenwich/GR-26-1_noliver_View19_afqd-bq.jpg`,
    alt: "Витрина Greenwich в интерьере",
  },
  contactsMaterial: {
    src: `${P}/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View03.jpg`,
    alt: "Светлая спальня с кроватью Greenwich и белым гардеробом",
  },
  partnersAtmosphere: {
    src: `${P}/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View01.jpg`,
    alt: "Спальня Cloud с кроватью Greenwich и рабочим столом",
  },
  partnersStrip: [
    {
      src: `${P}/greenwich/GR-67-1_greenwich_graphite16.jpg`,
      alt: "Комод Greenwich в графитовой отделке",
    },
    {
      src: `${P}/greenwich/GR-26-1_greenwich_darkblue19_a1fi-rc.jpg`,
      alt: "Витрина Greenwich в тёмно-синей отделке",
    },
    {
      src: `${P}/oliver/OL-95-1_gallery_02.jpg`,
      alt: "Детская кровать Oliver",
    },
  ],
} as const
