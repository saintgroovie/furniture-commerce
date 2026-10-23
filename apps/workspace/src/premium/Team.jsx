import React, { useEffect, useState } from "react";
import {
  Button,
  Field,
  FormError,
  Notice,
  Section,
  PageHeading,
  Empty,
  Drawer,
  Badge,
} from "./ui.jsx";
import { useDeskCommand, DeskTools } from "./DeskTools.jsx";
import { History } from "./History.jsx";
import { liveFetch } from "./storage.js";
import { ROLE_LABELS } from "./RoleHome.jsx";

export function StaffOptions({
  data,
  value,
  onChange,
  disabled,
  label = "Ответственный",
  optional = true,
  entityType,
}) {
  const allowedRoles = {
    person: ["seller", "director", "god"],
    company: ["seller", "accountant", "director", "god"],
    request: ["seller", "production", "director", "god"],
    invoice: ["seller", "accountant", "director", "god"],
  }[entityType];
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {optional && <option value="">Не назначен</option>}
        {value && !data.staff.some((s) => s.id === value) && (
          <option value={value}>Сотрудник недоступен</option>
        )}
        {data.staff
          .filter(
            (s) =>
              (s.access?.enabled !== false &&
                (!allowedRoles || allowedRoles.includes(s.access?.role)) &&
                !accessExpired(s) &&
                (!data.access || ROLE_LABELS[s.access?.role])) ||
              s.id === value,
          )
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === data.session.id ? " · вы" : ""}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function OwnershipFields({
  data,
  value,
  onChange,
  disabled,
  company = true,
  entityType,
}) {
  return (
    <>
      {company && (
        <Field label="Компания">
          <select
            value={value.companyId || ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, companyId: e.target.value })}
          >
            <option value="">Без компании</option>
            {data.companies
              .filter((c) => c.status === "active" || c.id === value.companyId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "archived" ? " · архив" : ""}
                </option>
              ))}
          </select>
        </Field>
      )}
      <StaffOptions
        entityType={entityType}
        data={data}
        value={value.assigneeId || ""}
        disabled={disabled}
        onChange={(id) => onChange({ ...value, assigneeId: id })}
      />
    </>
  );
}
export function Assignment({ kind, item, data, refresh, notify }) {
  const [form, setForm] = useState(() => ({
    companyId: item.companyId || "",
    assigneeId: item.assigneeId || "",
  }));
  const [expected, setExpected] = useState(item.assignmentVersion || 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = useDeskCommand(),
    conflict = expected !== (item.assignmentVersion || 0);
  if (!data.capabilities.assignments)
    return (
      <Section title="Компания и ответственный">
        <Notice>
          {data.access
            ? `Компания: ${(kind === "companies" ? item.name : data.companies.find((c) => c.id === item.companyId)?.name) || "Без компании"}. Ответственный: ${item.assignee}. Назначение изменяет продавец, директор или полный администратор.`
            : "Назначения недоступны до полной загрузки команды и компаний. Обновите данные."}
        </Notice>
      </Section>
    );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await send({
        type: "record.update",
        id: item.id,
        entityType: {
          people: "person",
          requests: "request",
          orders: "order",
          companies: "company",
        }[kind],
        ownership: form,
        expectedVersion: expected,
      });
      setExpected(response.result.record.version);
      await refresh();
      notify("Назначение сохранено");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title={
        kind === "companies"
          ? "Ответственный за компанию"
          : "Компания и ответственный"
      }
    >
      <form className="form-stack" onSubmit={save}>
        <OwnershipFields
          entityType={
            {
              people: "person",
              requests: "request",
              orders: "order",
              companies: "company",
            }[kind]
          }
          data={data}
          value={form}
          onChange={setForm}
          disabled={busy}
          company={kind !== "companies"}
        />
        <FormError>{error}</FormError>
        {conflict && (
          <Notice>
            <p>
              Назначение изменилось. Сейчас:{" "}
              {data.companies.find((c) => c.id === item.companyId)?.name ||
                "без компании"}
              , {item.assignee}.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setForm({
                  companyId: item.companyId || "",
                  assigneeId: item.assigneeId || "",
                });
                setExpected(item.assignmentVersion || 0);
                setError("");
              }}
            >
              Загрузить новое назначение
            </Button>
          </Notice>
        )}
        <Button type="submit" disabled={busy || conflict}>
          {busy ? "Сохраняем…" : "Сохранить назначение"}
        </Button>
      </form>
    </Section>
  );
}
const companyFields = [
  ["name", "Название", "text", 200],
  ["legalName", "Юридическое наименование", "text", 300],
  ["taxId", "ИНН", "text", 12],
  ["kpp", "КПП", "text", 9],
  ["phone", "Телефон компании", "tel", 80],
  ["email", "Email компании", "email", 254],
  ["address", "Адрес", "text", 1000],
];
const values = (item) =>
  Object.fromEntries([
    ...companyFields.map(([key]) => [key, item?.[key] || ""]),
    ["notes", item?.notes || ""],
    ["status", item?.status || "active"],
  ]);
function CompanyForm({ item, data, refresh, notify, onCreated }) {
  const [form, setForm] = useState(() => values(item)),
    [expected, setExpected] = useState(item?.version || 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(null),
    [confirmArchive, setConfirmArchive] = useState(false);
  const send = useDeskCommand(),
    conflict = Boolean(item && expected !== item.version);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await send({
        type: item ? "company.update" : "company.create",
        ...(item ? { id: item.id, expectedVersion: expected } : {}),
        company: form,
      });
      if (item) setExpected(response.result.company.version);
      else setCreated(response.result.company);
      await refresh();
      if (onCreated) onCreated(response.result.company);
      notify(item ? "Компания сохранена" : "Компания добавлена");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <div className="form-stack">
        <Notice>Компания сохранена в базе.</Notice>
        <FormError>{error}</FormError>
        <Button
          onClick={async () => {
            try {
              await refresh();
              onCreated(created);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Открыть компанию
        </Button>
      </div>
    );
  return (
    <form className="form-stack" onSubmit={save}>
      {companyFields.map(([key, label, type, max]) => (
        <Field key={key} label={label}>
          <input
            required={key === "name"}
            type={type}
            maxLength={max}
            value={form[key]}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </Field>
      ))}
      <Field label="Заметки о компании">
        <textarea
          rows={5}
          maxLength={10000}
          value={form.notes}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </Field>
      {item && (
        <>
          <p className="muted small">
            {form.status === "archived"
              ? "Компания в архиве. Связи, документы и история сохранены."
              : "Действующая компания"}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              form.status === "archived"
                ? setForm((f) => ({ ...f, status: "active" }))
                : setConfirmArchive(true)
            }
          >
            {form.status === "archived"
              ? "Вернуть из архива"
              : "Поместить в архив"}
          </button>
          {confirmArchive && (
            <Notice>
              <p>
                Компания останется в истории. Новые карточки нельзя будет
                связать с ней.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setForm((f) => ({ ...f, status: "archived" }));
                  setConfirmArchive(false);
                }}
              >
                Подтвердить архивирование
              </Button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmArchive(false)}
              >
                Оставить действующей
              </button>
            </Notice>
          )}
        </>
      )}
      <FormError>{error}</FormError>
      {conflict && (
        <Notice>
          <p>
            Коллега изменил компанию. Сейчас в базе: {item.name},{" "}
            {item.legalName}, {item.taxId}, {item.phone}, {item.email},{" "}
            {item.address}.
          </p>
          <p>{item.notes}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setForm(values(item));
              setExpected(item.version);
              setError("");
            }}
          >
            Загрузить новую версию компании
          </Button>
        </Notice>
      )}
      <Button
        type="submit"
        disabled={busy || conflict || !data.capabilities.companies}
      >
        {busy
          ? "Сохраняем…"
          : item
            ? "Сохранить компанию"
            : "Добавить компанию"}
      </Button>
    </form>
  );
}
export function CompanyCreate({ data, refresh, go, notify, onClose }) {
  return (
    <Drawer title="Добавить компанию" kicker="Продажи" wide onClose={onClose}>
      <CompanyForm
        data={data}
        refresh={refresh}
        notify={notify}
        onCreated={(c) => {
          onClose();
          go("companies", c.id);
        }}
      />
    </Drawer>
  );
}
export function Companies({ data, go, openPanel, refresh, notify, id }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("active");
  if (!data.sourceStates.companies?.ok)
    return <Notice>Компании не загружены. Обновите подключение.</Notice>;
  if (id) {
    const item = data.companies.find((c) => c.id === id);
    if (!item)
      return <Empty title="Компания не найдена" text="Обновите список." />;
    return (
      <div className="standard-page">
        <PageHeading
          title={item.name}
          kicker="Компания"
          back={{ label: "← Компании", onClick: () => go("companies") }}
        />
        <div className="object-workspace">
          <Section title="Карточка компании">
            <CompanyForm
              key={id}
              item={item}
              data={data}
              refresh={refresh}
              notify={notify}
            />
          </Section>
          <aside>
            <Assignment
              key={id}
              kind="companies"
              item={item}
              data={data}
              refresh={refresh}
              notify={notify}
            />
            {["people", "requests", "orders", "invoices"]
              .filter(
                (kind) => !data.access || data.access.pages.includes(kind),
              )
              .map((kind) => (
                <Section
                  key={kind}
                  title={
                    {
                      people: "Контакты компании",
                      requests: "Обращения компании",
                      orders: "Заказы компании",
                      invoices: "Счета компании",
                    }[kind]
                  }
                >
                  {data[kind]
                    .filter((r) => r.companyId === id)
                    .map((r) => (
                      <button
                        key={r.id}
                        className="live-related"
                        onClick={() => go(kind, r.id)}
                      >
                        <b>
                          {r.name ||
                            r.title ||
                            `Счёт ${r.number || "· черновик"}`}
                        </b>
                        <span>
                          {r.assignee ||
                            (r.status === "registered"
                              ? "Из 1С"
                              : r.status === "archived"
                                ? "Архив"
                                : "Черновик")}
                        </span>
                      </button>
                    ))}
                  {!data[kind].some((r) => r.companyId === id) && (
                    <p className="muted">Связанных записей пока нет.</p>
                  )}
                </Section>
              ))}
          </aside>
        </div>
        <DeskTools
          kind="companies"
          id={id}
          data={data}
          refresh={refresh}
          notify={notify}
        />
        <History type="company" id={id} updatedAt={data.loadedAt} data={data} />
      </div>
    );
  }
  const rows = data.companies.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      `${c.name} ${c.legalName} ${c.taxId} ${c.email} ${c.phone}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="standard-page">
      <PageHeading
        title="Компании"
        description="Компании, студии и партнёры: контакты, обращения и документы."
        action={
          <Button
            disabled={!data.capabilities.companies}
            onClick={() => openPanel({ type: "companyCreate" })}
          >
            Добавить компанию
          </Button>
        }
      />
      <div className="form-grid">
        <Field label="Поиск компаний">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, ИНН, email или телефон"
          />
        </Field>
        <Field label="Статус компаний">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Действующие</option>
            <option value="archived">Архив</option>
            <option value="all">Все</option>
          </select>
        </Field>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Компания</th>
                <th>ИНН</th>
                <th>Контакт</th>
                <th>Ответственный</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      className="inline-link"
                      onClick={() => go("companies", c.id)}
                    >
                      {c.name}
                    </button>
                    <small className="muted">{c.legalName}</small>
                  </td>
                  <td>{c.taxId || "Не указан"}</td>
                  <td>{c.email || c.phone || "Не указан"}</td>
                  <td>{c.assignee}</td>
                  <td>{c.status === "archived" ? "Архив" : "Действующая"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Компании не найдены"
          text="Добавьте компанию или измените поиск."
        />
      )}
    </div>
  );
}
function accessExpired(s) {
  return s.access?.expiresAt && Date.parse(s.access.expiresAt) <= Date.now();
}
function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function StaffAccessForm({ staff, currentId, refresh, onSaved }) {
  const [role, setRole] = useState(staff.access?.role || "seller"),
    [enabled, setEnabled] = useState(staff.access?.enabled !== false),
    [until, setUntil] = useState(localDateTime(staff.access?.expiresAt)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await liveFetch("/api/live/team", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              intent: "access.update",
              id: staff.id,
              role,
              enabled,
              expectedVersion: staff.access?.version || 0,
              expiresAt: until ? new Date(until).toISOString() : null,
              key: crypto.randomUUID(),
            }),
          });
          await refresh();
          onSaved();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={`Роль: ${staff.name}`}>
        <select
          value={role}
          disabled={busy || staff.id === currentId}
          onChange={(e) => setRole(e.target.value)}
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Доступ до (пусто — бессрочно)">
        <input
          type="datetime-local"
          value={until}
          disabled={busy || staff.id === currentId}
          onChange={(e) => setUntil(e.target.value)}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || staff.id === currentId}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        Доступ открыт
      </label>
      <FormError>{error}</FormError>
      {staff.id !== currentId && (
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить доступ"}
        </Button>
      )}
    </form>
  );
}
export function Team({ data, refresh, notify }) {
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("seller"),
    [temporary, setTemporary] = useState(false),
    [invitation, setInvitation] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState([]),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("active");
  useEffect(() => {
    if (!data.access?.manageStaff) return;
    const controller = new AbortController();
    liveFetch("/api/live/team", { signal: controller.signal })
      .then((r) => setPending(r.invitations))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [revision, data.access?.manageStaff]);
  async function run(body) {
    setBusy(true);
    setError("");
    try {
      const result = await liveFetch("/api/live/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setInvitation(body.intent === "invite" ? result : null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="standard-page">
      <PageHeading
        title="Сотрудники"
        description="Действующие учётные записи Medusa. Каждый сотрудник входит со своим паролем."
      />
      <Section title="Команда">
        <div className="filter-row">
          <Field label="Поиск сотрудника">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя или email"
            />
          </Field>
          <Field label="Доступ сотрудников">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Открыт</option>
              <option value="closed">Закрыт</option>
              <option value="all">Все</option>
            </select>
          </Field>
        </div>
        <ul className="desk-items">
          {data.staff
            .filter(
              (s) =>
                (status === "all" ||
                  (status === "closed"
                    ? s.access?.enabled === false || accessExpired(s)
                    : s.access?.enabled !== false && !accessExpired(s))) &&
                `${s.name} ${s.email}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.email}</small>
                  <small>
                    {ROLE_LABELS[s.access?.role] || "Роль не назначена"} ·{" "}
                    {s.access?.enabled === false || accessExpired(s)
                      ? "Доступ закрыт"
                      : "Доступ открыт"}
                  </small>
                </div>
                {s.id === data.session.id && <Badge>Ваш профиль</Badge>}
                {data.access?.manageStaff && (
                  <Button variant="secondary" onClick={() => setEditing(s.id)}>
                    Доступ
                  </Button>
                )}
              </li>
            ))}
        </ul>
      </Section>
      {editing && data.staff.some((s) => s.id === editing) && (
        <Drawer title="Доступ сотрудника" onClose={() => setEditing(null)}>
          <p>{data.staff.find((s) => s.id === editing).name}</p>
          <StaffAccessForm
            key={`${editing}:${data.staff.find((s) => s.id === editing).access?.version}`}
            staff={data.staff.find((s) => s.id === editing)}
            currentId={data.session.id}
            refresh={refresh}
            onSaved={() => {
              setEditing(null);
              notify("Доступ сотрудника обновлён");
            }}
          />
        </Drawer>
      )}
      {pending.length > 0 && (
        <Section title="Ожидают присоединения">
          <ul className="desk-items">
            {pending.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <small>
                    {Date.parse(i.expiresAt) > Date.now()
                      ? "Действует до " +
                        new Date(i.expiresAt).toLocaleDateString("ru-RU")
                      : "Срок истёк"}
                  </small>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => run({ intent: "revoke", id: i.id })}
                >
                  Отозвать
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data.access?.manageStaff && (
        <Section title="Пригласить сотрудника">
          <p className="muted">
            Ссылка предоставляет доступ к клиентской базе и документам.
            Передайте её только приглашённому сотруднику. Письмо автоматически
            не отправляется.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run({ intent: "invite", email, role, temporary });
            }}
          >
            <Field label="Email нового сотрудника">
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Рабочая роль">
              <select
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value)}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <label>
              <input
                type="checkbox"
                checked={temporary}
                disabled={busy}
                onChange={(e) => setTemporary(e.target.checked)}
              />{" "}
              Временный доступ на 1 час
            </label>
            {role === "god" && (
              <Notice>
                Полный доступ ко всем данным, настройкам и управлению
                сотрудниками.
              </Notice>
            )}
            <Button disabled={busy || !data.capabilities.assignments}>
              {busy ? "Готовим…" : "Создать ссылку-приглашение"}
            </Button>
          </form>
          <FormError>{error}</FormError>
          {invitation && (
            <div className="form-stack">
              <Notice>
                Приглашение для {invitation.email}. Действует до{" "}
                {new Date(invitation.expiresAt).toLocaleDateString("ru-RU")}.
              </Notice>
              <Field label="Ссылка-приглашение">
                <input
                  readOnly
                  value={invitation.url}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invitation.url);
                    setError("");
                  } catch {
                    setError("Выделите и скопируйте ссылку из поля выше");
                  }
                }}
              >
                Скопировать ссылку
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run({ intent: "revoke", id: invitation.id })}
              >
                Отозвать приглашение
              </Button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
