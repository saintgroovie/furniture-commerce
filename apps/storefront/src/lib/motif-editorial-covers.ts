/**
 * Curated editorial illustrations for existing published themes, applied by the storefront.
 * This is presentation data, never evidence for product × painting combinations.
 * Does not modify the catalog API, product thumbnails, prices or theme membership.
 */
export const MOTIF_EDITORIAL_COVERS: Readonly<Record<string, string>> = Object.freeze({
  "ants-village": "/images/editorial/willie-winkie/ants-village/cover.webp",
  ballet: "/images/editorial/willie-winkie/ballet/cover.webp",
  fairies: "/images/editorial/willie-winkie/fairies/cover.webp",
  "fantasy-kingdom": "/images/editorial/willie-winkie/fantasy-kingdom/cover.webp",
  infanta: "/images/editorial/willie-winkie/infanta/cover.webp",
  molly: "/images/editorial/willie-winkie/molly/cover.webp",
  pastoral: "/images/editorial/willie-winkie/pastoral/cover.webp",
  "royal-lilies": "/images/editorial/willie-winkie/royal-lilies/cover.webp",
  "rural-scenery": "/images/editorial/willie-winkie/rural-scenery/cover.webp",
  "teddy-bear": "/images/editorial/willie-winkie/teddy-bear/cover.webp",
  templars: "/images/editorial/willie-winkie/templars/cover.webp",
  "tiggy-winkle": "/images/editorial/willie-winkie/tiggy-winkle/cover.webp",
  tommy: "/images/editorial/willie-winkie/tommy/cover.webp",
  albion: "/images/editorial/willie-winkie/albion/cover.webp",
  "brigantine-blue": "/images/editorial/willie-winkie/brigantine-blue/cover.webp",
})

export function editorialMotifCover(slug: string): string | null {
  if (process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS !== "1") return null
  return Object.prototype.hasOwnProperty.call(MOTIF_EDITORIAL_COVERS, slug)
    ? MOTIF_EDITORIAL_COVERS[slug]
    : null
}
