/** Exact nine Oliver14 upholstery photos, visually approved clean fabric rectangle.
 * CSS shows only source pixels100..150 x300..350 of each1000square photo.
 * No guessed HEX, full-product texture fallback, metadata or purchase mutation.
 */
const SOURCES = {
  "lillian-01": "/product-static/products/oliver/OL-14-2_color_lillian_01.jpg",
  "lillian-02": "/product-static/products/oliver/OL-14-2_color_lillian_02.jpg",
  "lillian-03": "/product-static/products/oliver/OL-14-2_color_lillian_03.jpg",
  "lillian-04": "/product-static/products/oliver/OL-14-2_color_lillian_04.jpg",
  "lillian-05": "/product-static/products/oliver/OL-14-2_color_lillian_05.jpg",
  "lorna-01": "/product-static/products/oliver/OL-14-2_color_lorna_01.jpg",
  "lorna-02": "/product-static/products/oliver/OL-14-2_color_lorna_02.jpg",
  "lorna-03": "/product-static/products/oliver/OL-14-2_color_lorna_03.jpg",
  "lorna-04": "/product-static/products/oliver/OL-14-2_color_lorna_04.jpg",
} as const

export function oliver14FabricPhotoSwatch(
  productHandle: string | undefined, key: string, mainSrc: string
) {
  if (productHandle !== "ol-14-2" || !Object.hasOwn(SOURCES, key)) return null
  const expected = SOURCES[key as keyof typeof SOURCES]
  const actual = mainSrc.trim().replace(/^\/static\//, "/product-static/")
  if (actual !== expected) return null
  return {
    src: expected,
    style: {
      backgroundImage: `url("${expected}")`,
      backgroundSize: "2000% 2000%",
      backgroundPosition: "10.526315789% 31.578947368%",
      backgroundRepeat: "no-repeat",
    },
  }
}
