export function workspaceInvitationUrl(origin, basePath, token) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || !["", "/os"].includes(basePath) ||
      typeof token !== "string" || !token) throw new Error("Invalid workspace invitation address");
  return `${url.origin}${basePath}/#/join/${encodeURIComponent(token)}`;
}
