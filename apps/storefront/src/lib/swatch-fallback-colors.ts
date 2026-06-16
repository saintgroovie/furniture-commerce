/** Muted token palette when image sampling fails (matches globals.css intent). */
export const SWATCH_FALLBACK_HEX: Record<string, string> = {
  neutral: "#e8e4df",
  blue: "#b8c9d8",
  grey: "#a8a399",
  gray: "#a8a399",
  cream: "#ece4d6",
  milk: "#ebe4d8",
  olive: "#848872",
  green: "#6d7a64",
  white: "#f2ede6",
  beige: "#d6cfc2",
  black: "#2e2924",
  brown: "#6f5642",
  graphite: "#4a4d4a",
  ivory: "#f0ebe2",
  dark: "#3a4038",
  oak: "#c4a882",
  walnut: "#6b4c35",
  wenge: "#3d2b24",
  velvet: "#6e6278",
  linen: "#d8d0c4",
}

export function fallbackHexForToken(token: string | null | undefined): string {
  if (!token) return SWATCH_FALLBACK_HEX.neutral!
  return SWATCH_FALLBACK_HEX[token] ?? SWATCH_FALLBACK_HEX.neutral!
}
