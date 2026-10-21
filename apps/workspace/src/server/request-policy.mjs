export function sameOriginAllowed(request, env = process.env) {
  try {
    const expected = new URL(
      env.WOODRIGHT_WORKSPACE_ORIGIN ||
        `http://127.0.0.1:${env.PORT || "4320"}`,
    ).origin;
    const actual = request.headers.get("origin");
    return (
      actual === expected &&
      request.headers.get("sec-fetch-site") !== "cross-site"
    );
  } catch {
    return false;
  }
}
export async function readJsonBounded(request, limit) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("Ожидается JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Запрос слишком большой");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
