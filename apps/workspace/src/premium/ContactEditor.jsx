import React, { useState } from "react";
import { Button, Field, FormError, Notice, Section } from "./ui.jsx";
import { useDeskCommand } from "./DeskTools.jsx";
const values = (item) => ({
  name: item.name,
  phone: item.phone,
  email: item.email,
  comment: item.comment,
});
export function ContactEditor({ item, refresh, notify }) {
  const [form, setForm] = useState(() => values(item));
  const [expected, setExpected] = useState(item.updatedAt);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = useDeskCommand();
  const conflict = expected !== item.updatedAt;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await send({
        type: "person.update",
        id: item.id,
        person: form,
        expectedUpdatedAt: expected,
      });
      setExpected(response.result.person.updated_at);
      await refresh();
      notify("Контакт сохранён");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Контакт">
      <form className="form-stack" onSubmit={save}>
        {[
          ["name", "Имя", "text", 200],
          ["phone", "Телефон", "tel", 80],
          ["email", "Email", "email", 254],
        ].map(([key, label, type, max]) => (
          <Field key={key} label={label}>
            <input
              required={key === "name"}
              type={type}
              maxLength={max}
              disabled={busy}
              value={form[key]}
              onChange={(e) =>
                setForm((old) => ({ ...old, [key]: e.target.value }))
              }
            />
          </Field>
        ))}
        <Field label="Комментарий">
          <textarea
            rows={4}
            maxLength={10000}
            disabled={busy}
            value={form.comment}
            onChange={(e) =>
              setForm((old) => ({ ...old, comment: e.target.value }))
            }
          />
        </Field>
        <FormError>{error}</FormError>
        {conflict && (
          <Notice tone="warning">
            <p>
              Контакт изменился. Сейчас в базе: {item.name},{" "}
              {item.phone || "телефон не указан"},{" "}
              {item.email || "email не указан"}.
            </p>
            <p className="preserve-lines">{item.comment}</p>
            <div className="desk-row-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setForm(values(item));
                  setExpected(item.updatedAt);
                  setError("");
                }}
              >
                Загрузить новую версию
              </Button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setExpected(item.updatedAt);
                  setError("");
                }}
              >
                Продолжить с моим текстом
              </button>
            </div>
          </Notice>
        )}
        <Button type="submit" disabled={busy || conflict}>
          {busy ? "Сохраняем…" : "Сохранить контакт"}
        </Button>
      </form>
    </Section>
  );
}
