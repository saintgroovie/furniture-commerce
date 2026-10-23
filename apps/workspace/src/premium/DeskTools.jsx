import { workspacePath } from "../lib/paths.mjs";
import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Empty,
  Field,
  FormError,
  Notice,
  Section,
  Badge,
} from "./ui.jsx";
import { liveFetch } from "./storage.js";
import { StaffOptions } from "./Team.jsx";
import { date, TODAY } from "./model.mjs";

// Retain the exact operation on an uncertain response. Editing the form starts a new operation.
export function useDeskCommand() {
  const pending = useRef(null);
  return async (input) => {
    const fingerprint = JSON.stringify(input);
    if (pending.current?.fingerprint !== fingerprint) {
      const command = { ...input, key: crypto.randomUUID() };
      if (!command.id) command.id = `desk_${crypto.randomUUID()}`;
      pending.current = { fingerprint, command };
    }
    const result = await liveFetch("/api/live/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pending.current.command),
    });
    pending.current = null;
    return result;
  };
}
function Reminders({ type, id, data, refresh, notify }) {
  const [summary, setSummary] = useState(""),
    [dueOn, setDueOn] = useState(TODAY);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const send = useDeskCommand();
  const [assigneeId, setAssigneeId] = useState(data.session.id || "");
  const rows = data.reminders.filter(
    (r) => r.objectType === type && r.objectId === id,
  );
  async function run(input) {
    setBusy(true);
    setError("");
    try {
      await send(input);
      if (input.type === "reminder.create") setSummary("");
      await refresh();
      notify("Напоминание сохранено");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Следующий шаг">
      {rows.length ? (
        <ul className="desk-items">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {date(r.due, true)} ·{" "}
                  {data.staff?.find((s) => s.id === r.assigneeId)?.name ||
                    "Сотрудник"}{" "}
                  ·{" "}
                  {r.status === "open"
                    ? "Запланировано"
                    : r.status === "done"
                      ? "Выполнено"
                      : "Отменено"}
                </small>
              </div>
              {data.capabilities.assignments && (
                <StaffOptions
                  entityType={type}
                  data={data}
                  value={r.assigneeId}
                  onChange={(assigneeId) =>
                    run({
                      type: "reminder.update",
                      id: r.id,
                      status: r.status,
                      expectedVersion: r.version,
                      assigneeId,
                    })
                  }
                  disabled={busy}
                  label={`Исполнитель: ${r.title}`}
                  optional={false}
                />
              )}
              {data.capabilities.reminders &&
                (data.capabilities.assignments ||
                  r.assigneeId === data.session.id) && (
                  <div className="desk-row-actions">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run({
                          type: "reminder.update",
                          id: r.id,
                          expectedVersion: r.version,
                          status: r.status === "open" ? "done" : "open",
                        })
                      }
                    >
                      {r.status === "open" ? "Выполнено" : "Вернуть"}
                    </Button>
                    {r.status === "open" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "reminder.update",
                            id: r.id,
                            expectedVersion: r.version,
                            status: "cancelled",
                          })
                        }
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Напоминаний пока нет.</p>
      )}
      {data.capabilities.reminders ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            run({
              type: "reminder.create",
              entityType: type,
              entityId: id,
              summary,
              dueOn,
              ...(data.capabilities.assignments && assigneeId
                ? { assigneeId }
                : {}),
            });
          }}
        >
          <Field label="Что нужно сделать">
            <input
              required
              maxLength={280}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Например, согласовать размеры"
            />
          </Field>
          <Field label="Когда" hint="Дата по московскому времени">
            <input
              type="date"
              required
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </Field>
          {data.capabilities.assignments && (
            <StaffOptions
              entityType={type}
              data={data}
              value={assigneeId}
              onChange={setAssigneeId}
              disabled={busy}
              label="Исполнитель напоминания"
              optional={false}
            />
          )}
          <Button type="submit" disabled={busy || !summary.trim()}>
            {busy ? "Сохраняем…" : "Добавить напоминание"}
          </Button>
        </form>
      ) : (
        <Notice>
          Напоминания появятся после установки серверного обновления.
        </Notice>
      )}
      <FormError>{error}</FormError>
    </Section>
  );
}
export function Attachments({ type, id, data, notify, refresh, onLoaded }) {
  const [rows, setRows] = useState([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [visibility, setVisibility] = useState(
    data.access?.role === "production" ? "assigned" : "business",
  );
  const [archived, setArchived] = useState(false);
  const input = useRef(null),
    send = useDeskCommand();
  const url = `/api/live/attachments?entityType=${type}&entityId=${encodeURIComponent(id)}&archived=${archived ? "1" : "0"}`;
  async function reload() {
    const result = await liveFetch(url);
    setRows(result.attachments);
    onLoaded?.(archived ? [] : result.attachments);
    setTotal(result.count);
  }
  useEffect(() => {
    if (!data.capabilities.attachmentRead) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    liveFetch(url, { signal: controller.signal })
      .then((result) => {
        setRows(result.attachments);
        onLoaded?.(archived ? [] : result.attachments);
        setTotal(result.count);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, data.capabilities.attachmentRead, onLoaded, archived]);
  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      setError("Выберите непустой файл не больше 8 МБ");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      await send({
        type: "attachment.upload",
        entityType: type,
        entityId: id,
        filename: file.name,
        content,
        ...(data.capabilities.fileVisibility ? { visibility } : {}),
      });
      setFile(null);
      if (input.current) input.current.value = "";
      await reload();
      await refresh();
      notify("Файл прикреплён");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(fileId) {
    setBusy(true);
    setError("");
    try {
      await send({ type: "attachment.remove", id: fileId });
      setConfirm("");
      await reload();
      await refresh();
      notify("Вложение убрано из карточки");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(fileId) {
    setBusy(true);
    setError("");
    try {
      await send({ type: "attachment.restore", id: fileId });
      await reload();
      await refresh();
      notify("Вложение восстановлено");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Файлы и документы" action={<Badge>{rows.length}</Badge>}>
      {data.capabilities.fileVisibility && (
        <div className="action-row">
          <Button
            type="button"
            variant={archived ? "secondary" : "primary"}
            disabled={busy}
            onClick={() => {
              setArchived(false);
              setConfirm("");
            }}
          >
            Вложения
          </Button>
          <Button
            type="button"
            variant={archived ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => {
              setArchived(true);
              setConfirm("");
            }}
          >
            Архив файлов
          </Button>
        </div>
      )}
      {!data.capabilities.attachmentRead ? (
        <Notice>
          Для договоров и чертежей нужно установить приватное хранилище.
          Фотографии каталога хранятся отдельно.
        </Notice>
      ) : loading ? (
        <p role="status">Загружаем вложения…</p>
      ) : rows.length ? (
        <ul className="desk-items">
          {rows.map((f) => (
            <li key={f.id}>
              <div>
                {archived ? (
                  <strong>{f.filename}</strong>
                ) : (
                  <a
                    className="inline-link"
                    href={workspacePath(
                      `/api/live/attachments/${encodeURIComponent(f.id)}`,
                    )}
                    download
                  >
                    {f.filename}
                  </a>
                )}
                <small>
                  {new Intl.NumberFormat("ru-RU", {
                    maximumFractionDigits: 1,
                  }).format(f.size / 1024)}{" "}
                  КБ · {date(f.created_at)}
                  {data.capabilities.fileVisibility &&
                    ` · ${f.visibility === "assigned" ? "Доступно назначенному производству" : "Продажи и бухгалтерия"}`}
                </small>
              </div>
              {data.capabilities.attachments &&
                (!data.access ||
                  ["god", "director"].includes(data.access.role) ||
                  f.uploaded_by === data.session.id) &&
                (archived ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => restore(f.id)}
                  >
                    Восстановить
                  </Button>
                ) : confirm === f.id ? (
                  <div className="desk-row-actions">
                    <span>Убрать из карточки?</span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => remove(f.id)}
                    >
                      Убрать
                    </Button>
                    <button
                      className="text-button"
                      onClick={() => setConfirm("")}
                    >
                      Оставить
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirm(f.id)}
                    aria-label={`Убрать ${f.filename}`}
                  >
                    Убрать
                  </button>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        !error && <p className="muted">Документы пока не прикреплены.</p>
      )}
      {total > rows.length && (
        <Notice>
          Показано {rows.length} из {total} файлов. Полный список требует
          постраничной загрузки.
        </Notice>
      )}
      {data.capabilities.attachments && !archived && (
        <form className="form-stack" onSubmit={upload}>
          <Field
            label="Прикрепить файл"
            hint="До 8 МБ. Доступ проверяется при каждом скачивании."
          >
            <input
              ref={input}
              type="file"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError("");
              }}
            />
          </Field>
          {data.capabilities.fileVisibility &&
            ["request", "order"].includes(type) &&
            data.access?.role !== "production" && (
              <Field label="Кому доступен файл">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  disabled={busy}
                >
                  <option value="business">Продажи и бухгалтерия</option>
                  <option value="assigned">
                    Также назначенному сотруднику производства
                  </option>
                </select>
              </Field>
            )}
          <Button type="submit" disabled={busy || !file}>
            {busy ? "Загружаем…" : "Прикрепить"}
          </Button>
        </form>
      )}
      <FormError>{error}</FormError>
    </Section>
  );
}
export function DeskTools({ kind, id, data, refresh, notify, attachmentsRef }) {
  const type = {
    people: "person",
    requests: "request",
    orders: "order",
    companies: "company",
  }[kind];
  if (!type) return null;
  return (
    <div className="desk-tools">
      <Reminders
        type={type}
        id={id}
        data={data}
        refresh={refresh}
        notify={notify}
      />
      <div ref={attachmentsRef} tabIndex={-1}>
        <Attachments
          type={type}
          id={id}
          data={data}
          notify={notify}
          refresh={refresh}
        />
      </div>
    </div>
  );
}
