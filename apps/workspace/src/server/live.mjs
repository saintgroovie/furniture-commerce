import "server-only";
import { cookies } from "next/headers";
import { encodeSession, decodeSession } from "../lib/session-codec.ts";
import { sameOriginAllowed } from "./request-policy.mjs";
import { identityMatches, readBackendIdentity } from "./runtime-identity.mjs";
export const COOKIE = "wr_desk";
export const NO_STORE = { "Cache-Control": "private, no-store" };
export class LiveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function backendBase(env = process.env) {
  const raw = env.MEDUSA_BACKEND_INTERNAL_URL || env.MEDUSA_BACKEND_URL;
  if (!raw) throw new LiveError(503, "Соединение с Medusa не настроено");
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new LiveError(503, "Некорректная конфигурация Medusa");
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new LiveError(503, "Для удалённой Medusa требуется HTTPS");
  return url;
}
export async function staff() {
  const jar = await cookies();
  const s = decodeSession(jar.get(COOKIE)?.value);
  if (!s || s.kind !== "medusa")
    throw new LiveError(401, "Войдите в Woodright OS");
  return s;
}
export function sameOrigin(request) {
  if (!sameOriginAllowed(request))
    throw new LiveError(403, "Запрос отклонён. Обновите страницу");
}
/** @param {string} path @param {{session?: {token:string,email:string},method?:string,body?:unknown}} options */
export async function upstream(path, { session, method = "GET", body } = {}) {
  if (
    !path.startsWith("/admin/") &&
    !["/health", "/auth/user/emailpass"].includes(path)
  )
    throw new LiveError(400, "Недопустимый запрос");
  const headers = { accept: "application/json" };
  if (session) headers.authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    const response = await fetch(new URL(path, backendBase()), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    const raw = await response.text();
    if (response.status === 401)
      throw new LiveError(401, "Сессия Medusa закончилась. Войдите снова");
    if (!response.ok)
      throw new LiveError(
        response.status,
        response.status === 403
          ? "Недостаточно прав"
          : response.status === 409
            ? "Данные изменились. Обновите страницу"
            : response.status === 404
              ? "Функция отсутствует в рабочей Medusa"
              : "Medusa не смогла выполнить запрос",
      );
    if (path === "/health")
      return {
        ok: true,
        identity: readBackendIdentity(response.headers),
      };
    try {
      return JSON.parse(raw);
    } catch {
      throw new LiveError(502, "Medusa вернула некорректный ответ");
    }
  } catch (e) {
    if (e instanceof LiveError) throw e;
    throw new LiveError(
      504,
      method === "GET"
        ? "Нет соединения с Medusa. Попробуйте обновить"
        : "Запись не подтверждена. Проверьте объект перед повтором",
    );
  }
}
export async function verifiedBackend() {
  const health = await upstream("/health");
  if (!identityMatches(health.identity))
    throw new LiveError(
      503,
      "Версия или база Medusa изменилась. Требуется проверить подключение",
    );
  return { ...health.identity, verifiedAt: new Date().toISOString() };
}
/** @returns {Promise<Record<string, any> & {count:number,truncated:boolean}>} */
export async function readPaged(
  path,
  key,
  session,
  { pageSize = 100, maxPages = 10 } = {},
) {
  const rows = [];
  let count = 0;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(path, "http://local");
    u.searchParams.set("limit", String(pageSize));
    u.searchParams.set("offset", String(page * pageSize));
    const data = await upstream(u.pathname + u.search, { session });
    if (!Array.isArray(data[key]) || !Number.isFinite(data.count))
      throw new LiveError(502, "Не удалось подтвердить полноту списка Medusa");
    rows.push(...data[key]);
    count = data.count;
    if (rows.length >= count) return { [key]: rows, count, truncated: false };
    if (data[key].length === 0)
      throw new LiveError(502, "Medusa вернула неполный список");
  }
  return { [key]: rows, count, truncated: true };
}
/** @returns {{httpOnly:boolean,sameSite:'strict',secure:boolean,path:string,maxAge:number}} */
export function cookieOptions(request) {
  const local =
    process.env.WOODRIGHT_WORKSPACE_RUNTIME === "local-private" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname);
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: !local,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}
export { encodeSession };
