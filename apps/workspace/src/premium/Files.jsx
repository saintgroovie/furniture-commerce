import { workspacePath } from "../lib/paths.mjs";
import React, { useEffect, useState } from "react";
import { Button, Empty, Field, FormError, Notice, PageHeading } from "./ui.jsx";
import { liveFetch } from "./storage.js";
import { date } from "./model.mjs";
const kinds = {
  person: "people",
  request: "requests",
  order: "orders",
  company: "companies",
};
export function Files({ data, go }) {
  const [result, setResult] = useState(null),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!data.capabilities.attachmentRead) return;
    const controller = new AbortController();
    setError("");
    liveFetch("/api/live/files", { signal: controller.signal })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [data.capabilities.attachmentRead, revision]);
  const related = (f) =>
    data[kinds[f.entity_type]]?.find((r) => r.id === f.entity_id);
  const rows =
    result?.attachments.filter((f) =>
      `${f.filename} ${related(f)?.name || related(f)?.title || f.entity_id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) || [];
  return (
    <div className="standard-page">
      <PageHeading
        title="Файлы и документы"
        description="Договоры, чертежи и вложения к карточкам клиентов, обращений и заказов."
        action={
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Обновить
          </Button>
        }
      />
      {!data.capabilities.attachmentRead ? (
        <Notice>Закрытое хранилище ожидает установки на сервере.</Notice>
      ) : (
        <>
          <Field label="Поиск файлов">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Название файла или карточки"
            />
          </Field>
          <p className="muted small">
            Чтобы прикрепить документ, откройте карточку клиента, обращения или
            заказа.
          </p>
          <FormError>{error}</FormError>
          {!result && !error ? (
            <p role="status">Загружаем документы…</p>
          ) : rows.length ? (
            <ul className="desk-items">
              {rows.map((f) => (
                <li key={f.id}>
                  <div>
                    <a
                      className="inline-link"
                      href={workspacePath(
                        `/api/live/attachments/${encodeURIComponent(f.id)}`,
                      )}
                      download
                    >
                      {f.filename}
                    </a>
                    <small>
                      {(f.size / 1024).toLocaleString("ru-RU", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      КБ · {date(f.created_at)}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => go(kinds[f.entity_type], f.entity_id)}
                  >
                    {related(f)?.name ||
                      related(f)?.title ||
                      "Открыть карточку"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !error && (
              <Empty
                title={
                  query ? "Файлы не найдены" : "Документы пока не прикреплены"
                }
                text={
                  query
                    ? "Измените поисковый запрос."
                    : "Добавьте первый файл в карточке клиента, обращения или заказа."
                }
              />
            )
          )}
          {result?.truncated && (
            <Notice>
              Загружено {result.attachments.length} из {result.count} файлов.
              Поиск работает по загруженной части.
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
