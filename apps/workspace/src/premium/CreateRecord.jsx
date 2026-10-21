import React, { useRef, useState } from "react";
import { Button, Drawer, Field, FormError, Notice } from "./ui.jsx";
import { useDeskCommand } from "./DeskTools.jsx";
import { OwnershipFields } from "./Team.jsx";

export function CreateRecord({ kind, data, onClose, refresh, go, notify }) {
  const request = kind === "request";
  const [personId, setPersonId] = useState("");
  const [person, setPerson] = useState({
    name: "",
    email: "",
    phone: "",
    comment: "",
  });
  const [form, setForm] = useState({
    title: "",
    description: "",
    dimensions: "",
    materials: "",
    budget: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [ownership, setOwnership] = useState({
    companyId: "",
    assigneeId: data.session.id || "",
  });
  const ids = useRef(null);
  if (!ids.current)
    ids.current = {
      id: `desk_${crypto.randomUUID()}`,
      personId: `lead_${crypto.randomUUID()}`,
    };
  const send = useDeskCommand();
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  async function openCreated(result) {
    await refresh();
    onClose();
    go(
      request ? "requests" : "people",
      request ? result.bespoke_request.id : result.person.id,
    );
    notify(request ? "Обращение создано" : "Клиент добавлен");
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await send(
        request
          ? {
              type: "request.create",
              id: ids.current.id,
              ...form,
              ...(data.capabilities.assignments ? { ownership } : {}),
              personId: personId || ids.current.personId,
              ...(personId ? {} : { person }),
            }
          : {
              type: "person.create",
              id: ids.current.personId,
              person,
              ...(data.capabilities.assignments ? { ownership } : {}),
            },
      );
      setCreated(response.result);
      await openCreated(response.result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={request ? "Новое обращение" : "Добавить клиента"}
      kicker="Продажи"
      onClose={busy ? () => {} : onClose}
      wide
    >
      {created ? (
        <div className="form-stack">
          <Notice>
            Запись сохранена в рабочей базе. Повторное создание не требуется.
          </Notice>
          <FormError>{error}</FormError>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await openCreated(created);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Открыть сохранённую карточку
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack">
          {request && (
            <Field label="Клиент">
              <select
                value={personId}
                disabled={busy}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">Новый клиент</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.phone ? ` · ${p.phone}` : p.email ? ` · ${p.email}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(!request || !personId) && (
            <>
              {[
                ["name", "Имя клиента", "text", 200],
                ["phone", "Телефон", "tel", 80],
                ["email", "Email", "email", 254],
              ].map(([key, label, type, max]) => (
                <Field key={key} label={label}>
                  <input
                    type={type}
                    required={key === "name"}
                    maxLength={max}
                    disabled={busy}
                    value={person[key]}
                    onChange={(e) =>
                      setPerson((old) => ({ ...old, [key]: e.target.value }))
                    }
                  />
                </Field>
              ))}
              {!request && (
                <Field label="Комментарий">
                  <textarea
                    rows={4}
                    maxLength={10000}
                    disabled={busy}
                    value={person.comment}
                    onChange={(e) =>
                      setPerson((old) => ({ ...old, comment: e.target.value }))
                    }
                  />
                </Field>
              )}
            </>
          )}
          {request && (
            <>
              <Field label="Тема обращения">
                <input
                  required
                  maxLength={200}
                  disabled={busy}
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Например, шкаф по индивидуальным размерам"
                />
              </Field>
              <Field label="Что нужно клиенту">
                <textarea
                  rows={5}
                  maxLength={10000}
                  disabled={busy}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </Field>
              {[
                ["dimensions", "Размеры", 500],
                ["materials", "Материалы и отделка", 2000],
                ["budget", "Бюджет", 500],
              ].map(([key, label, max]) => (
                <Field key={key} label={label}>
                  <input
                    maxLength={max}
                    disabled={busy}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </Field>
              ))}
              <p className="muted small">
                После создания можно назначить следующий шаг и прикрепить файлы.
              </p>
            </>
          )}
          <FormError>{error}</FormError>
          {data.capabilities.assignments && (
            <OwnershipFields
              data={data}
              value={ownership}
              onChange={setOwnership}
              disabled={busy}
            />
          )}
          <Button type="submit" disabled={busy || !data.capabilities.crmCreate}>
            {busy
              ? "Сохраняем…"
              : request
                ? "Создать обращение"
                : "Добавить клиента"}
          </Button>
        </form>
      )}
    </Drawer>
  );
}
