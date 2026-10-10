export function isSafePartnerFile(url?: string | null): boolean {
  const file = (url ?? "").trim()
  if (!file || /^(javascript|data):/i.test(file)) return false
  return file.startsWith("/") || /^https?:\/\//i.test(file)
}

export function isPartnerPdf(url?: string | null, mime?: string | null): boolean {
  if (!isSafePartnerFile(url)) return false
  return /application\/pdf/i.test(mime ?? "") || /\.pdf(?:$|[?#])/i.test((url ?? "").trim())
}
