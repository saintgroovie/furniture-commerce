import React, { useEffect, useState } from "react";
import { Button, FormError, Section } from "./ui.jsx";
import { liveFetch } from "./storage.js";
const labels = {
  "person.created": "Клиент добавлен",
  "person.updated": "Контакт клиента обновлён",
  "request.created": "Обращение создано",
  "request.updated": "Обращение обновлено",
  "reminder.created": "Добавлено напоминание",
  "reminder.updated": "Напоминание обновлено",
  "attachment.uploaded": "Прикреплён файл",
  "attachment.removed": "Вложение удалено",
  "attachment.restored": "Вложение восстановлено",
};
export function History({ type, id, updatedAt }) {
  const [rows, setRows] = useState(null),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setError("");
    liveFetch(
      `/api/live/history?entityType=${type}&entityId=${encodeURIComponent(id)}`,
    )
      .then((result) => {
        if (current) setRows(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [type, id, updatedAt, revision]);
  return (
    <Section title="История действий">
      <FormError>{error}</FormError>
      {error && (
        <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
          Повторить загрузку
        </Button>
      )}
      {!rows && !error ? (
        <p className="muted">Загружаем историю…</p>
      ) : (
        rows && (
          <>
            {rows.events.length ? (
              <ul className="desk-items">
                {rows.events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>
                        {labels[event.action] || "Карточка обновлена"}
                      </strong>
                      <small>
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Europe/Moscow",
                        }).format(new Date(event.created_at))}{" "}
                        МСК
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Новые действия команды появятся здесь.</p>
            )}
            {rows.truncated && (
              <p className="muted small">
                Показано {rows.events.length} из {rows.count} действий.
              </p>
            )}
          </>
        )
      )}
    </Section>
  );
}
