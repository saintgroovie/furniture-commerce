export const BASE_PATH = process.env.NEXT_PUBLIC_WORKSPACE_BASE_PATH || "";
if (!["", "/os"].includes(BASE_PATH))
  throw new Error("Unsupported Woodright OS base path");
export function workspacePath(path) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Expected same-origin workspace path");
  return BASE_PATH + path;
}
