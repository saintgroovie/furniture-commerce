/** Local, evidence-bound OL-66-4 addition. No catalog or backend writes. */
export const OL664_HERO = "/product-static/products/oliver/ol-66-4-i2.jpg"
export const OL664_CHAIR_SCENE = "/images/products/oliver/ol-66-4-with-chair-7695dc3e6059.jpg"
export const OL664_CHAIR_CAPTION = "Стул в стоимость не входит"

const FRONT = "/product-static/products/oliver/OL-66-4_gallery_01.jpg"
const REAR = "/product-static/products/oliver/OL-66-4_gallery_03.jpg"
const SCHEME = "/product-static/products/oliver/OL-66-4_gallery_04.jpg"

export function prepareOl664Gallery(mainSrc: string, extraSrcs: string[]): {
  mainSrc: string
  extraSrcs: string[]
  captions?: Readonly<Record<string, string>>
} {
  const expected = [FRONT, REAR, SCHEME]
  const originals = extraSrcs.filter((src) => src !== OL664_CHAIR_SCENE)
  // Match the verified complete gallery, rather than a SKU inferred from a filename.
  // A changed hero/execution or an unfamiliar source pool requires a fresh review.
  if (mainSrc !== OL664_HERO ||
      originals.join("\u0000") !== expected.join("\u0000")) {
    return { mainSrc, extraSrcs }
  }
  const extras = [...originals]
  extras.splice(extras.indexOf(SCHEME), 0, OL664_CHAIR_SCENE)
  return {
    mainSrc,
    extraSrcs: extras,
    captions: { [OL664_CHAIR_SCENE]: OL664_CHAIR_CAPTION },
  }
}
