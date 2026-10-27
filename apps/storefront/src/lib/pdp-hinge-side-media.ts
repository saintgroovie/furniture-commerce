/** Visually verified images of the native handle-side execution; no SKU inference.
 * Read the complete native pool before role-slot / near-duplicate collapse. */
export type HingeSideMedia = { left: string[]; right: string[] }
const ATTACH = "/static/imports/WR-ATTACH-20261020/"
const IMPORT = "/static/imports/WR-PFW-20260721T020528Z/"
const EVIDENCE: Record<string, {code:string; left:string[]; right:string[]}> = {
  "ol-08-2": {code:"OL-08-2",left:[ATTACH+"OL-08-2_closed_front_door_left_01.jpeg"],right:[ATTACH+"OL-08-2_closed_front_door_right_01.jpeg"]},
  // Both corner-wardrobe views have the knob on the left. No verified right photo.
  "ol-00-1": {code:"OL-00-1",left:[IMPORT+"dae28b75ac16513637b80851141352a44fe972434e137ac47f8be7b5e20c5c28.jpg",IMPORT+"1751a8818eedf88450cf9c2a9fd8f760f11682dfcedce86da1b4de29db2a5f0f.jpg"],right:[]},
  // Closed, frontal, open-door and room views all show the same left-handled door.
  "ol-01-2": {code:"OL-01-2",left:[IMPORT+"9c3417fc705e5ad97ba29f84f91b42ce01edd170d24e3b9fa0352297d00202cb.jpg",IMPORT+"7b704e2a09abf1200e257fc5ad46859756f1d3a9b5a37f585b027467ed48ec27.jpg",IMPORT+"fc9f6e276fc21e5f1970ecaef7148dfdca88646fd524e277aba3929ce5cd4bff.jpg",IMPORT+"c5fa369c7b031107620ee1604813683ecee5203562db50ba75e2c4d2416498d1.jpg"],right:[]},
}
export function verifiedHingeSideMedia(product: Record<string, unknown>): HingeSideMedia | null {
  if (typeof product.handle !== "string" || product.status !== "published") return null
  const evidence=Object.hasOwn(EVIDENCE,product.handle)?EVIDENCE[product.handle]:undefined
  const metadata=product.metadata as Record<string,unknown>|undefined
  if (!evidence || metadata?.product_code_normalized!==evidence.code) return null
  const images=product.images as Array<{url?:unknown}>|undefined
  const expected=[...evidence.left,...evidence.right]
  if (!Array.isArray(images) || !expected.every(url=>images.some(image=>image?.url===url))) return null
  const normalize=(urls:string[])=>urls.map(url=>url.replace("/static/","/product-static/"))
  return {left:normalize(evidence.left),right:normalize(evidence.right)}
}
export function resolveHingeSideMedia(media:HingeSideMedia,side:"left"|"right"|null) {
  const urls=side?media[side]:[...media.left,...media.right]
  return {mainSrc:urls[0]??"",extraSrcs:urls.slice(1)}
}
