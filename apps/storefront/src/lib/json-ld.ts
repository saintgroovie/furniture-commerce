/** Escape HTML delimiters while preserving the original JSON data. */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}
