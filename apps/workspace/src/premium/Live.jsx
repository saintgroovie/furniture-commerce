import { workspacePath } from "../lib/paths.mjs";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowUpRight,
  CheckCircle,
  LockKey,
  Plug,
  Receipt,
  Paperclip,
  EnvelopeSimple,
  Database,
  ArrowLeft,
  SignOut,
  WarningCircle,
  Eye,
  EyeSlash,
  Phone,
} from "@phosphor-icons/react";
import {
  Button,
  Badge,
  Notice,
  Section,
  Definition,
  Drawer,
  Field,
  FormError,
  Empty,
  PageHeading,
} from "./ui.jsx";
import { liveFetch } from "./storage.js";
import { DeskTools, useDeskCommand } from "./DeskTools.jsx";
import { CreateRecord } from "./CreateRecord.jsx";
import { History } from "./History.jsx";
import { ContactEditor } from "./ContactEditor.jsx";
import { Assignment, CompanyCreate } from "./Team.jsx";
import { PasswordChange } from "./PasswordChange.jsx";
const types = {
  STANDARD: "Готовое изделие",
  CONFIGURABLE: "Выбор исполнения",
  BESPOKE: "По проекту",
};
const requestStatuses = {
  new: "Новое",
  contacted: "Связались",
  quote_sent: "Расчёт отправлен",
  paid: "Оплачено",
  in_production: "В производстве",
  completed: "Завершено",
};
export function Login({ error, onLogin }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [health, setHealth] = useState(null),
    [showPassword, setShowPassword] = useState(false);
  const probe = () => {
    setHealth(null);
    liveFetch("/api/live/status")
      .then(setHealth)
      .catch(() => setHealth({ connected: false }));
  };
  useEffect(probe, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await liveFetch("/api/live/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      await onLogin();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="live-login">
      <aside>
        <a className="brand" href={workspacePath("/")}>
          <span className="brand-lockup">
            <img
              src={workspacePath("/brand/woodright-white.svg")}
              alt="Woodright"
            />
            <span className="brand-os">OS</span>
          </span>
        </a>
        <div>
          <span className="eyebrow">Рабочее пространство</span>
          <h1>
            Вся работа.
            <br />В одном месте.
          </h1>
          <p>Обращения, клиенты, заказы и каталог Woodright.</p>
        </div>
        <small>
          <LockKey size={17} /> Приватный доступ сотрудников
        </small>
      </aside>
      <main>
        <div className="login-card">
          <span className="eyebrow">Woodright OS</span>
          <h2>Войти в рабочую базу</h2>
          <p className="muted">Используйте учётную запись сотрудника Medusa.</p>
          <div
            className={`connection-pill ${health?.connected ? "connected" : ""}`}
            role="status"
          >
            <span />
            {health === null
              ? "Проверяем соединение…"
              : health.connected
                ? "Соединение с Medusa установлено"
                : "Нет соединения с Medusa"}
            <button aria-label="Проверить соединение" onClick={probe}>
              <ArrowClockwise size={17} />
            </button>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label="Рабочий email">
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Пароль">
              <div className="password-input">
                <input
                  aria-label="Пароль"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Скрыть пароль" : "Показать пароль"
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <FormError>{message || error}</FormError>
            <Button type="submit" disabled={busy || !health?.connected}>
              {busy ? "Входим…" : "Войти"}
            </Button>
          </form>
          <p className="login-note">
            После входа откроются данные действующей системы. Изменения доступны
            только для подключённых функций.
          </p>
        </div>
      </main>
    </div>
  );
}
export const sourceNames = {
  products: "Каталог",
  people: "Люди",
  requests: "Обращения",
  orders: "Заказы",
  processes: "Изготовление",
  rooms: "Комнаты",
  reminders: "Напоминания",
  companies: "Компании",
  records: "Назначения",
  staff: "Сотрудники",
};
export function LiveNotice({ data, refresh, busy }) {
  const failed = Object.entries(data.sourceStates).filter(([, v]) => !v.ok);
  return (
    <div className="live-notice">
      <span>
        <span className="live-dot" />
        {data.identity.environment === "public_production"
          ? "Рабочая база"
          : "Подключённая база"}{" "}
        · {data.writeEnabled ? "подключённые действия доступны" : "просмотр"}
        <small>
          Обновлено{" "}
          {new Intl.DateTimeFormat("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Moscow",
          }).format(new Date(data.loadedAt))}{" "}
          МСК
        </small>
      </span>
      <button className="text-button" disabled={busy} onClick={refresh}>
        <ArrowClockwise size={16} />
        {busy ? "Обновляем…" : "Обновить"}
      </button>
      {failed.length > 0 && (
        <p className="live-data-warning">
          <WarningCircle size={16} /> Не удалось загрузить:{" "}
          {failed.map(([key]) => sourceNames[key]).join(", ")}. В этих разделах
          данные могут быть неполными.
        </p>
      )}
    </div>
  );
}
export function SourceGate({ page, data, children }) {
  const key = {
      people: "people",
      requests: "requests",
      products: "products",
      storefront: "products",
      orders: "orders",
      rooms: "rooms",
      companies: "companies",
      team: "staff",
    }[page],
    source = data.sourceStates[key];
  if (source && !source.ok)
    return (
      <div className="standard-page">
        <PageHeading title={sourceNames[key]} />
        <Notice tone="warning">
          {source.message}. Обновите данные или проверьте подключение в разделе
          «Интеграции».
        </Notice>
      </div>
    );
  return (
    <>
      {source?.truncated && (
        <Notice tone="warning">
          Загружены первые {source.count} записей из {source.total}. Поиск
          работает по загруженной части.
        </Notice>
      )}
      {children}
    </>
  );
}
const serviceCards = [
  {
    key: "medusa",
    icon: Database,
    title: "Medusa",
    subtitle: "Товары, обращения и заказы",
    status: "Подключение настроено",
    text: "Единый источник каталога, клиентов, заказов, оплаты и доставки. Факты загружаются напрямую из рабочей системы.",
  },
  {
    key: "accounting",
    icon: Receipt,
    title: "1С:Бухгалтерия 8",
    subtitle: "Счета и подтверждение оплат",
    status: "Уточняем у бухгалтера",
    text: "Счёт готовится в OS и регистрируется в 1С. Номер, печатная форма и поступления возвращаются из 1С. До настройки обмена выпуск счетов недоступен.",
  },
  {
    key: "files",
    icon: Paperclip,
    title: "Приватное хранилище",
    subtitle: "Договоры, чертежи и документы",
    status: "Ожидает настройки",
    text: "Закрытое хранилище договоров и чертежей. Скачивание после входа сотрудника, привязка к карточке и история действий. Фотографии каталога читаются отдельно из Medusa.",
  },
  {
    key: "telephony",
    icon: Phone,
    title: "MANGO OFFICE",
    subtitle: "Звонки и история общения",
    status: "Нужен доступ к ВАТС",
    text: "Входящий звонок с карточкой клиента, история и пропущенные, звонок из обращения и записи разговоров по правам сотрудника. Подключение готовится к вашей ВАТС.",
  },
  {
    key: "mail",
    icon: EnvelopeSimple,
    title: "Яндекс 360",
    subtitle: "Рабочая почта",
    status: "Ящик не выбран",
    text: "Связь переписки с клиентом, обращением и заказом. Подключается один подтверждённый рабочий ящик через OAuth. Отправка будет отдельным действием сотрудника.",
  },
];
export function Integrations({ data, focus, compact = false }) {
  const cards = focus
    ? serviceCards.filter((s) => s.key === focus)
    : serviceCards;
  return (
    <div className={compact ? "form-stack" : "standard-page"}>
      {!compact && (
        <PageHeading
          title={
            focus === "accounting"
              ? "Счета"
              : focus === "files"
                ? "Файлы"
                : "Интеграции"
          }
          description="Подключения рабочей Woodright OS и состояние функций."
        />
      )}
      {focus && (
        <Notice>
          {focus === "accounting"
            ? "Выбрана 1С:Бухгалтерия 8. Для подключения нужны точная версия конфигурации и доступный способ обмена."
            : focus === "files"
              ? "Клиентские документы будут доступны после подключения закрытого хранилища."
              : "Эта функция ещё не подключена к рабочей базе."}
        </Notice>
      )}
      <div className="integration-grid">
        {cards.map((s) => (
          <section className="integration-card" key={s.key}>
            <s.icon size={27} weight="light" />
            <Badge
              tone={
                s.key === "medusa" ||
                (s.key === "files" && data?.capabilities.attachmentRead)
                  ? "positive"
                  : "waiting"
              }
            >
              {s.key === "files" && data?.capabilities.attachmentRead
                ? "Подключено"
                : s.status}
            </Badge>
            <h2>{s.title}</h2>
            <small>{s.subtitle}</small>
            <p>{s.text}</p>
            {s.key === "medusa" && data && (
              <dl>
                {Object.entries(data.sourceStates).map(([key, value]) => (
                  <div key={key}>
                    <dt>{sourceNames[key]}</dt>
                    <dd>
                      {value.restricted
                        ? "Недоступно вашей роли"
                        : value.ok
                          ? `${value.count} записей`
                          : "Недоступно"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>
      {!focus && (
        <Section title="Рабочие функции">
          <div className="integration-scope">
            <p>
              <b>Данные рабочей системы</b>
              <span>
                Каталог с исполнениями и готовностью, реальные обращения и
                контакты, заказы с раздельными статусами оплаты, производства и
                доставки.
              </span>
            </p>
            <p>
              <b>Сохранение и совместная работа</b>
              <span>
                {data?.capabilities.requestUpdate
                  ? "Обращения сохраняются с защитой от конфликтов. Доступны напоминания, приватные вложения и история действий. "
                  : data?.access
                    ? "Действия сохранения доступны в соответствии с вашей рабочей ролью. "
                    : "Сохранение обращений, напоминания и приватные вложения появятся после подключения серверных функций. "}
                {data?.capabilities.assignments
                  ? "Компании и ответственные подключены к рабочей базе."
                  : data?.access
                    ? "Назначения изменяет продавец, директор или полный администратор."
                    : "Компании и ответственные появятся после подключения командных функций."}
              </span>
            </p>
            <p>
              <b>Документы и деньги</b>
              <span>
                1С выдаёт номер счёта и подтверждает поступление. Изменение
                этапа изготовления не отмечает заказ оплаченным.
              </span>
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}
export function LivePanel({ panel, data, onClose, refresh, go, notify }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await liveFetch("/api/live/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "logout" }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }
  const focus =
    panel.type === "invoiceEditor" ||
    panel.type === "invoices" ||
    panel.type === "invoiceDetail"
      ? "accounting"
      : panel.type === "files"
        ? "files"
        : undefined;
  if (
    (panel.type === "companyCreate" ||
      (panel.type === "create" && panel.kind === "company")) &&
    data.capabilities.companies
  )
    return (
      <CompanyCreate
        data={data}
        refresh={refresh}
        go={go}
        notify={notify}
        onClose={onClose}
      />
    );
  if (
    panel.type === "create" &&
    ["person", "request"].includes(panel.kind) &&
    data.capabilities.crmCreate
  )
    return (
      <CreateRecord
        kind={panel.kind}
        data={data}
        onClose={onClose}
        refresh={refresh}
        go={go}
        notify={notify}
      />
    );
  return (
    <Drawer
      title={
        focus === "accounting"
          ? "Счета и 1С"
          : focus === "files"
            ? "Файлы и документы"
            : panel.type === "settings"
              ? "Рабочее пространство"
              : "Подключение функции"
      }
      onClose={onClose}
      wide
    >
      {panel.type === "settings" ? (
        <>
          <Section title="Сотрудник">
            <p>{data.session.email}</p>
            <Button
              variant="secondary"
              icon={SignOut}
              onClick={logout}
              disabled={busy}
            >
              Выйти
            </Button>
          </Section>
          <PasswordChange />
          <Integrations data={data} compact />
        </>
      ) : (
        <>
          <Integrations data={data} focus={focus} compact />
          {!focus && (
            <Notice tone="warning">
              Запрошенное действие ещё не подключено к рабочему контуру. Данные
              не изменены.
            </Notice>
          )}
        </>
      )}
    </Drawer>
  );
}
function formatTotal(order) {
  if (order.totalMinor == null) return "Сумма не передана";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: order.currency || "RUB",
    }).format(order.totalMinor / 100);
  } catch {
    return "Валюта не указана";
  }
}
export function LiveObjectDetail({
  kind,
  id,
  data,
  go,
  openPanel,
  refresh,
  notify,
}) {
  const item = data[kind]?.find((x) => x.id === id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(item?.status || ""),
    [notes, setNotes] = useState(item?.internalNotes || ""),
    [expectedUpdatedAt, setExpectedUpdatedAt] = useState(item?.updatedAt || "");
  const sendCommand = useDeskCommand();
  const attachmentsRef = useRef(null);
  if (!item)
    return (
      <Empty
        title="Запись не найдена"
        text="Обновите данные или откройте список."
        action={<Button onClick={() => go(kind)}>К списку</Button>}
      />
    );
  const person = data.people.find((p) => p.id === item.personId),
    photos = data.files.filter((f) => f.objectId === id);
  async function saveRequest(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendCommand({
        type: "request.update",
        id,
        status,
        notes,
        expectedUpdatedAt,
      });
      const latest = await refresh();
      const updated = latest?.requests?.find((r) => r.id === id);
      if (updated) setExpectedUpdatedAt(updated.updatedAt);
      notify("Обращение обновлено");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="standard-page">
      <PageHeading
        title={item.name || item.title}
        kicker={id}
        back={{
          label: `← ${sourceNames[kind] || "К списку"}`,
          onClick: () => go(kind),
        }}
        action={
          ["orders", "requests"].includes(kind) &&
          (!data.access || data.access.pages.includes("invoices")) ? (
            <Button
              icon={Receipt}
              onClick={() => openPanel({ type: "invoices", objectId: id })}
            >
              Счета
            </Button>
          ) : null
        }
      />
      {kind === "products" ? (
        <>
          <div className="object-state-bar">
            <Badge tone={item.status === "published" ? "positive" : "neutral"}>
              {item.status === "published"
                ? "На витрине"
                : item.status === "draft"
                  ? "Черновик"
                  : item.status}
            </Badge>
            <span>
              {types[item.type] || "Тип не указан"} ·{" "}
              {item.collection || "Коллекция не указана"}
            </span>
          </div>
          <div className="live-product-layout">
            <div>
              <Section title="Фотографии каталога">
                {photos.length ? (
                  <div className="live-photos">
                    {photos.map((f, i) => (
                      <a
                        key={f.id}
                        href={workspacePath(
                          `/api/live/media?productId=${encodeURIComponent(id)}&index=${i}`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={workspacePath(
                            `/api/live/media?productId=${encodeURIComponent(id)}&index=${i}`,
                          )}
                          alt={`${item.name}, фото ${i + 1}`}
                          loading={i ? "lazy" : "eager"}
                        />
                        {i === 0 && <span>Главная</span>}
                      </a>
                    ))}
                  </div>
                ) : (
                  <Notice>Фотографии не добавлены</Notice>
                )}
              </Section>
              <Section title="Описание">
                <p className="preserve-lines">
                  {item.description || "Описание не заполнено"}
                </p>
              </Section>
              <Section title={`Исполнения · ${item.variants.length}`}>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Исполнение</th>
                        <th>SKU</th>
                        <th>Цена, ₽</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.variants.map((v) => (
                        <tr key={v.id}>
                          <td>{v.title || "Без названия"}</td>
                          <td>{v.sku || "Не указан"}</td>
                          <td>
                            {v.rub_price?.amount == null
                              ? "Не задана"
                              : Number(v.rub_price.amount).toLocaleString(
                                  "ru-RU",
                                )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
            <aside>
              <Section title="Карточка товара">
                <Definition
                  items={[
                    ["Цена", item.priceLabel],
                    ["Артикул", item.sku || "Не указан"],
                    ["Ширина", item.width ? `${item.width} см` : "Не указана"],
                    [
                      "Высота",
                      item.height ? `${item.height} см` : "Не указана",
                    ],
                    ["Глубина", item.depth ? `${item.depth} см` : "Не указана"],
                  ]}
                />
              </Section>
              <Section title="Готовность к витрине">
                {item.issues.length ? (
                  <ul className="plain-list">
                    {item.issues.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : item.publishReady ? (
                  <Badge tone="positive">Проверки пройдены</Badge>
                ) : (
                  <Badge tone="waiting">Требуется сверка проверки</Badge>
                )}
                {item.integrationWarnings?.map((message, i) => (
                  <Notice key={i}>{message}</Notice>
                ))}
                {item.warnings.map((x, i) => (
                  <p className="muted small" key={i}>
                    {x}
                  </p>
                ))}
              </Section>
            </aside>
          </div>
        </>
      ) : kind === "orders" ? (
        <>
          <div className="order-axes">
            {[
              ...(data.access?.financial === false
                ? []
                : [["Оплата", item.payment]]),
              ["Изготовление", item.stage],
              ["Доставка", item.delivery],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <Badge>{value}</Badge>
              </div>
            ))}
          </div>
          <Section title="Заказ">
            <Definition
              items={[
                ["Номер", item.displayId],
                ...(data.access?.financial === false
                  ? []
                  : [["Сумма", formatTotal(item)]]),
                [
                  "Контакт",
                  person ? (
                    <button
                      className="inline-link"
                      onClick={() => go("people", person.id)}
                    >
                      {person.name}
                    </button>
                  ) : (
                    item.email || "Не указан"
                  ),
                ],
                ["Ориентир производства", item.estimate || "Не указан"],
              ]}
            />
          </Section>
          <Section title="Позиции">
            {item.lines.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Наименование</th>
                      <th>Количество</th>
                      {data.access?.financial !== false && (
                        <th>Цена за единицу</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {item.lines.map((l, i) => (
                      <tr key={l.id || i}>
                        <td>{l.name}</td>
                        <td>{l.qty}</td>
                        {data.access?.financial !== false && (
                          <td>
                            {new Intl.NumberFormat("ru-RU", {
                              style: "currency",
                              currency: item.currency || "RUB",
                            }).format(Number(l.price))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Notice>Состав заказа не передан текущим подключением</Notice>
            )}
          </Section>
          <Section title="Изготовление">
            <p>{item.note || "Внутренняя заметка не добавлена"}</p>
            <Notice>
              Оплата и доставка показаны из Medusa. Изменение производственного
              этапа будет доступно после проверки прав и сохранения.
            </Notice>
          </Section>
        </>
      ) : kind === "requests" ? (
        <>
          <div className="object-state-bar">
            <Badge>{item.statusLabel}</Badge>
            {person && (
              <button
                className="inline-link"
                onClick={() => go("people", person.id)}
              >
                {person.name}
              </button>
            )}
          </div>
          <div className="object-workspace">
            <div>
              <Section title="Запрос клиента">
                <p className="preserve-lines">
                  {item.note || "Комментарий не указан"}
                </p>
                <Definition
                  items={[
                    ["Размеры", item.dimensions || "Не указаны"],
                    ["Материалы", item.materials || "Не указаны"],
                    ...(data.access?.financial === false
                      ? []
                      : [["Бюджет", item.budget || "Не указан"]]),
                  ]}
                />
              </Section>
              <Section title="Внутренняя работа">
                <form className="form-stack" onSubmit={saveRequest}>
                  <Field label="Статус обращения">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={!data.capabilities.requestUpdate}
                    >
                      {Object.entries(requestStatuses).map(([value, label]) => (
                        <option
                          key={value}
                          value={value}
                          disabled={
                            (value === "paid" && item.status !== "paid") ||
                            (data.access?.role === "production" &&
                              !["in_production", "completed"].includes(value))
                          }
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Заметки команды">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={7}
                      maxLength={20000}
                      readOnly={!data.capabilities.requestUpdate}
                    />
                  </Field>
                  {!data.capabilities.requestUpdate && (
                    <Notice>
                      Просмотр рабочей базы. Сохранение включается после
                      проверки прав и защиты от одновременного редактирования.
                    </Notice>
                  )}
                  <FormError>{error}</FormError>
                  {item.updatedAt !== expectedUpdatedAt &&
                    data.capabilities.requestUpdate && (
                      <Notice tone="warning">
                        <p>
                          Карточка изменилась. Текущий статус:{" "}
                          {item.statusLabel}.
                        </p>
                        <p className="preserve-lines">
                          Заметки в базе: {item.internalNotes || "не добавлены"}
                        </p>
                        <div className="desk-row-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setNotes(item.internalNotes);
                              setStatus(item.status);
                              setExpectedUpdatedAt(item.updatedAt);
                              setError("");
                            }}
                          >
                            Загрузить новую версию
                          </Button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setExpectedUpdatedAt(item.updatedAt);
                              setError("");
                            }}
                          >
                            Продолжить с моим текстом
                          </button>
                        </div>
                      </Notice>
                    )}
                  <Button
                    type="submit"
                    disabled={
                      !data.capabilities.requestUpdate ||
                      busy ||
                      item.updatedAt !== expectedUpdatedAt
                    }
                  >
                    {busy ? "Сохраняем…" : "Сохранить"}
                  </Button>
                </form>
              </Section>
            </div>
            <aside>
              {(!data.access || data.access.pages.includes("people")) && (
                <Section title="Контакт">
                  <Definition
                    items={[
                      ["Имя", person?.name || "Не указан"],
                      ["Телефон", person?.phone || "Не указан"],
                      ["Email", person?.email || "Не указан"],
                    ]}
                  />
                </Section>
              )}
              <Button
                variant="secondary"
                icon={Paperclip}
                onClick={() => {
                  attachmentsRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  attachmentsRef.current?.focus({ preventScroll: true });
                }}
              >
                Файлы обращения
              </Button>
            </aside>
          </div>
        </>
      ) : kind === "people" ? (
        <>
          {data.capabilities.personUpdate ? (
            <ContactEditor item={item} refresh={refresh} notify={notify} />
          ) : (
            <Section title="Контакт">
              <Definition
                items={[
                  ["Имя", item.name],
                  ["Телефон", item.phone || "Не указан"],
                  ["Email", item.email || "Не указан"],
                  ["Комментарий", item.comment || "Не указан"],
                ]}
              />
            </Section>
          )}
          <Section title="Обращения">
            {data.requests
              .filter((r) => r.personId === id)
              .map((r) => (
                <button
                  key={r.id}
                  className="live-related"
                  onClick={() => go("requests", r.id)}
                >
                  <b>{r.title}</b>
                  <span>
                    {r.statusLabel}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              ))}
          </Section>
        </>
      ) : (
        <Section title="Описание">
          <p>{item.description || "Описание не заполнено"}</p>
          {kind === "rooms" && (
            <Notice>
              Связанный состав комнаты не передаётся текущим подключением.
            </Notice>
          )}
        </Section>
      )}
      {["people", "requests", "orders"].includes(kind) && (
        <Assignment
          key={`${kind}/${id}`}
          kind={kind}
          item={item}
          data={data}
          refresh={refresh}
          notify={notify}
        />
      )}
      <DeskTools
        attachmentsRef={attachmentsRef}
        kind={kind}
        id={id}
        data={data}
        refresh={refresh}
        notify={notify}
      />
      {data.capabilities.history &&
        ["people", "requests", "orders"].includes(kind) && (
          <History
            data={data}
            type={
              { people: "person", requests: "request", orders: "order" }[kind]
            }
            id={id}
            updatedAt={data.loadedAt}
          />
        )}
    </div>
  );
}
