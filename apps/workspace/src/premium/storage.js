export async function liveFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...options.headers, accept: "application/json" },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Не удалось прочитать ответ OS");
  }
  if (!response.ok) {
    const error = new Error(data.message || "Не удалось выполнить запрос");
    error.status = response.status;
    throw error;
  }
  return data;
}
export const loadData = () => liveFetch("/api/live/data");
export const saveData = () =>
  Promise.reject(
    new Error("Это действие ещё не подключено. Рабочие данные не изменены."),
  );
export const saveBlob = () =>
  Promise.reject(
    new Error("Для вложений нужно подключить приватное хранилище."),
  );
export async function loadBlob(file) {
  if (!file.remote)
    throw new Error("Документ отсутствует в серверном хранилище");
  const response = await fetch(
    `/api/live/media?productId=${encodeURIComponent(file.objectId)}&index=${file.mediaIndex}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!response.ok)
    throw new Error("Не удалось загрузить фотографию из Medusa");
  return response.blob();
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
