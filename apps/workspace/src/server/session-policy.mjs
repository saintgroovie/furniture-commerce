export function workspaceCookieName(basePath, env = process.env) {
  if (env.WOODRIGHT_WORKSPACE_RUNTIME === "hosted") return "wr_os";
  if (!basePath) return "wr_desk";
  return env.WOODRIGHT_WORKSPACE_RUNTIME === "local-private"
    ? `wr_os_${env.PORT || "4320"}`
    : "wr_os";
}

export function workspaceCookieOptions(requestUrl, basePath, env = process.env) {
  const local = env.WOODRIGHT_WORKSPACE_RUNTIME === "local-private" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(requestUrl).hostname);
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: !local,
    path: basePath || "/",
    maxAge: 60 * 60 * 12,
  };
}
