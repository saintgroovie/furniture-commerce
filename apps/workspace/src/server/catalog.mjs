import "server-only";
import {
  staff,
  upstream,
  verifiedBackend,
  LiveError,
  backendBase,
} from "./live.mjs";
import { catalogAllowed, CatalogError } from "./catalog-policy.mjs";
import { deskExchange } from "../lib/desk-bound.ts";
export async function catalogContext(write = false) {
  const session = await staff();
  await verifiedBackend();
  const features = await upstream("/admin/woodright/desk/capabilities", {
    session,
  });
  if (!catalogAllowed(features))
    throw new LiveError(
      403,
      "Изменение каталога доступно полному администратору",
    );
  if (write && process.env.WOODRIGHT_LIVE_WRITES !== "1")
    throw new LiveError(403, "Сохранение для этого подключения выключено");
  return {
    session,
    send: (path, method = "GET", body) =>
      upstream(path, { session, method, body }),
  };
}
export function catalogFailure(e) {
  const known = e instanceof LiveError || e instanceof CatalogError;
  return {
    message: known ? e.message : "Не удалось выполнить действие каталога",
    status: known ? e.status : 400,
  };
}
export async function uploadCatalogFile(session, file) {
  const body = new FormData();
  body.append("files", file, file.name);
  const response = await deskExchange(
    (signal) =>
      fetch(new URL("/admin/uploads", backendBase()), {
        method: "POST",
        body,
        headers: { authorization: `Bearer ${session.token}` },
        redirect: "error",
        cache: "no-store",
        signal,
      }),
    20000,
    () =>
      new LiveError(
        504,
        "Загрузка не подтверждена. Обновите карточку перед повтором",
      ),
  );
  if (response.status < 200 || response.status >= 300)
    throw new LiveError(
      response.status,
      "Medusa не смогла сохранить фотографию",
    );
  const result = JSON.parse(response.text);
  if (result.files?.length !== 1 || typeof result.files[0].url !== "string")
    throw new LiveError(502, "Хранилище вернуло некорректный ответ");
  return result.files[0];
}
