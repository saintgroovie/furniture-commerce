export function safeMediaUrl(value, backendOrigin, allowedOrigins = []) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const base = new URL(backendOrigin),
      url = new URL(value, base);
    if (
      url.username ||
      url.password ||
      !["https:", "http:"].includes(url.protocol) ||
      url.hash
    )
      return null;
    const allowed = new Set([base.origin, ...allowedOrigins]);
    if (!allowed.has(url.origin)) return null;
    // The Medusa provider owns public product assets only. Never use this route for documents.
    if (url.pathname.startsWith("/admin/") || url.pathname.startsWith("/auth/"))
      return null;
    return url;
  } catch {
    return null;
  }
}
export function mediaFetchUrl(url, backendOrigin, publicApiOrigins = []) {
  // Existing Medusa public static files may be fetched through the same private SSH
  // connection. This does not forward the staff Authorization header to assets.
  return publicApiOrigins.includes(url.origin) &&
    url.pathname.startsWith("/static/")
    ? new URL(url.pathname + url.search, backendOrigin)
    : url;
}
