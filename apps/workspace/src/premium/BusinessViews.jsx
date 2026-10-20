import React, { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  MagnifyingGlass,
  PencilSimple,
  Phone,
  Paperclip,
  Receipt,
  Clock,
  UserCircle,
  Buildings,
  Cube,
  Armchair,
  House,
  CheckCircle,
  WarningCircle,
  Check,
  NotePencil,
  Eye,
  Archive,
  Image,
  CalendarBlank,
  FileText,
} from "@phosphor-icons/react";
import {
  Button,
  IconButton,
  Badge,
  Empty,
  Field,
  Notice,
  Section,
  Definition,
  Timeline,
  PageHeading,
  Tabs,
  ContextLink,
  FormError,
  Drawer,
} from "./ui.jsx";
import {
  TODAY,
  STATUS,
  STAGES,
  date,
  money,
  toMinor,
  uid,
  event,
  invoiceTotal,
  todayGroups,
} from "./model.mjs";
const typeLabel = {
  STANDARD: "Готовое изделие",
  CONFIGURABLE: "Выбор исполнения",
  BESPOKE: "По проекту",
};
const tone = (s) =>
  ["done", "published", "Оплачен", "Готов к передаче"].includes(s)
    ? "positive"
    : ["waiting", "Не запланирована", "Согласовывается"].includes(s)
      ? "waiting"
      : ["new", "draft"].includes(s)
        ? "neutral"
        : "attention";
export function TodayView({ data, go, openPanel, mutate, notify, ...rest }) {
  const groups = todayGroups(data),
    first = groups.flatMap((g) => g.items)[0];
  const [selected, setSelected] = useState(first?.id || ""),
    [mobileDetail, setMobileDetail] = useState(false);
  const row =
    groups.flatMap((g) => g.items).find((r) => r.id === selected) || first;
  const overdue =
      groups.find((g) => g.title === "Просрочено")?.items.length || 0,
    today = groups.find((g) => g.title === "На сегодня")?.items.length || 0;
  const open = (row) =>
    row.kind === "request"
      ? go("requests", row.id)
      : row.kind === "order"
        ? go("orders", row.id)
        : row.kind === "product"
          ? go("products", row.id)
          : openPanel({ type: "help" });
  const item =
    data.requests.find((x) => x.id === row?.id) ||
    data.orders.find((x) => x.id === row?.id) ||
    data.products.find((x) => x.id === row?.id) ||
    data.reminders.find((x) => x.id === row?.id);
  const person = data.people.find((p) => p.id === item?.personId),
    company = data.companies.find((c) => c.id === person?.companyId);
  return (
    <div className="today-layout">
      <div className="today-main">
        <PageHeading
          title="Рабочая очередь"
          description={new Intl.DateTimeFormat("ru-RU", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Moscow",
          }).format(new Date())}
          action={
            <Button
              disabled={!data.writeEnabled}
              title={
                !data.writeEnabled
                  ? "Создание будет доступно после подключения записи"
                  : undefined
              }
              icon={Plus}
              onClick={() => openPanel({ type: "create", kind: "request" })}
            >
              Новое обращение
            </Button>
          }
        />
        <div className="queue-summary">
          {overdue > 0 && (
            <span className="critical-text">
              <b>{overdue}</b> просрочено
            </span>
          )}
          {today > 0 && (
            <span>
              <b>{today}</b> на сегодня
            </span>
          )}
          <button onClick={() => openPanel({ type: "help" })}>
            Статус подключений <ArrowUpRight size={14} />
          </button>
        </div>
        {groups.length ? (
          groups.map((g) => (
            <section className={`queue-section ${g.tone}`} key={g.title}>
              <h2>
                {g.title}
                <span>{g.items.length}</span>
              </h2>
              <div>
                {g.items.slice(0, 8).map((r) => (
                  <button
                    className={`queue-row ${r.id === row?.id ? "selected" : ""}`}
                    key={r.id}
                    onClick={() => {
                      setSelected(r.id);
                      setMobileDetail(true);
                    }}
                    onDoubleClick={() => open(r)}
                  >
                    <span className="queue-icon">
                      {r.kind === "order" || r.kind === "product" ? (
                        <Cube size={25} weight="light" />
                      ) : r.kind === "reminder" ? (
                        <Clock size={25} weight="light" />
                      ) : r.waiting ? (
                        <UserCircle size={25} weight="light" />
                      ) : (
                        <FileText size={25} weight="light" />
                      )}
                    </span>
                    <span className="queue-copy">
                      <b>{r.title}</b>
                      <small>{r.sub}</small>
                    </span>
                    <span
                      className={`queue-date ${r.due < TODAY ? "critical-text" : ""}`}
                    >
                      {r.due ? (r.due === TODAY ? "Сегодня" : date(r.due)) : ""}
                    </span>
                    <ArrowUpRight size={15} className="queue-arrow" />
                  </button>
                ))}
              </div>
              {g.items.length > 8 && (
                <button
                  className="queue-more text-button"
                  onClick={() =>
                    go(
                      g.items[0].kind === "product"
                        ? "products"
                        : g.items[0].kind === "order"
                          ? "orders"
                          : "requests",
                    )
                  }
                >
                  Ещё {g.items.length - 8} · открыть раздел{" "}
                  <ArrowUpRight size={15} />
                </button>
              )}
            </section>
          ))
        ) : (
          <Empty
            title="Очередь пуста"
            text="Нет просроченных обращений, напоминаний и вопросов каталога."
          />
        )}
      </div>
      {item && (
        <aside
          className={`today-inspector ${mobileDetail ? "mobile-open" : ""}`}
        >
          <div className="mobile-inspector-head">
            <b>Контекст</b>
            <IconButton
              icon={ArrowLeft}
              label="Вернуться к очереди"
              onClick={() => setMobileDetail(false)}
            />
          </div>
          <span className="eyebrow">
            {row?.kind === "request"
              ? "Обращение"
              : row?.kind === "order"
                ? "Заказ"
                : row?.kind === "product"
                  ? "Каталог"
                  : "Напоминание"}{" "}
            {item.id.startsWith("WR") ? item.id : ""}
          </span>
          <h2>{item.title || item.name}</h2>
          <p className="inspector-description">
            {item.next || item.issues?.join(" · ")}
          </p>
          <Badge tone={row?.due && row.due < TODAY ? "critical" : "attention"}>
            {row?.due && row.due < TODAY
              ? "Просрочено"
              : row?.waiting
                ? "Ждём клиента"
                : "Нужно действие"}
          </Badge>
          <Button className="full" icon={ArrowRight} onClick={() => open(row)}>
            {row.kind === "request"
              ? "Открыть обращение"
              : row.kind === "order"
                ? "Открыть заказ"
                : row.kind === "product"
                  ? "Открыть товар"
                  : "Открыть напоминание"}
          </Button>
          <Definition
            items={
              row?.kind === "product"
                ? [
                    ["Артикул", item.sku],
                    ["Коллекция", item.collection || "Не указана"],
                    ["Цена", item.priceLabel],
                    ["Проверки", "Данные текущей Medusa"],
                  ]
                : [
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
                        "Не указан"
                      ),
                    ],
                    ["Компания", company?.name || "Не указана"],
                    ["Ответственный", person?.assignee || "Не назначен"],
                    ["Следующий шаг", item.next || "Проверить данные"],
                  ]
            }
          />
          <div className="context-links">
            <ContextLink
              icon={Paperclip}
              label={row?.kind === "product" ? "Фотографии" : "Файлы"}
              count={
                data.files.filter((f) => f.objectId === item.id && !f.archived)
                  .length
              }
              onClick={() =>
                row?.kind === "product"
                  ? go("products", item.id)
                  : openPanel({ type: "files", objectId: item.id })
              }
            />
            {row?.kind !== "product" && (
              <ContextLink
                icon={Receipt}
                label="Счета"
                count={
                  data.invoices.filter((i) => i.objectId === item.id).length
                }
                onClick={() =>
                  openPanel({ type: "invoices", objectId: item.id })
                }
              />
            )}
          </div>
          <Section title="Обновление данных">
            <p className="muted small">
              {item.updatedAt
                ? `Изменено ${date(item.updatedAt, true)}`
                : "История изменений ещё не подключена"}
            </p>
          </Section>
        </aside>
      )}
    </div>
  );
}
export function ObjectList({ kind, data, go, openPanel }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("list");
  const source = data[kind] || [];
  const configs = {
    requests: {
      title: "Обращения",
      description:
        "Рабочие запросы клиентов: контекст, следующий шаг и история.",
      create: "Новое обращение",
      kind: "request",
      tabs: [
        ["all", "Все"],
        ["new", "Новые"],
        ["working", "В работе"],
        ["waiting", "Ждём клиента"],
        ["overdue", "Просроченные"],
        ["done", "Завершённые"],
      ],
    },
    people: {
      title: "Люди",
      description:
        "Контакты клиентов и дизайнеров, их обращения и связанные заказы.",
      create: "Добавить человека",
      kind: "person",
      tabs: [
        ["all", "Все"],
        ["Покупатель", "Покупатели"],
        ["Дизайнер", "Дизайнеры"],
        ["Лид", "Лиды"],
      ],
    },
    companies: {
      title: "Компании",
      description: "Компании и студии, связанные с людьми и обращениями.",
      create: "Добавить компанию",
      kind: "company",
      tabs: [["all", "Все"]],
    },
    orders: {
      title: "Заказы",
      description:
        "Оплата, изготовление и доставка - три независимых состояния заказа.",
      create: "Создать заказ",
      kind: "order",
      tabs: [
        ["all", "Все"],
        ["Подтверждение", "Подтверждение"],
        ["Изготовление", "В изготовлении"],
        ["Готов к передаче", "Готовы к передаче"],
      ],
    },
    products: {
      title: "Товары",
      description:
        "Карточки, исполнения, цены, фотографии и готовность к витрине.",
      create: "Добавить товар",
      kind: "product",
      tabs: [
        ["all", "Все"],
        ["published", "На витрине"],
        ["draft", "Черновики"],
        ["issues", "Нужны данные"],
      ],
    },
    rooms: {
      title: "Комнаты",
      description: "Самостоятельные комплекты из связанных товаров каталога.",
      create: "Добавить комнату",
      kind: "room",
      tabs: [
        ["all", "Все"],
        ["draft", "Черновики"],
        ["published", "На витрине"],
      ],
    },
  };
  const c = configs[kind];
  const rows = source.filter((r) => {
    const person = data.people.find((p) => p.id === r.personId),
      text = `${r.id} ${r.title || r.name} ${r.sku || ""} ${person?.name || ""}`;
    const matches =
      filter === "all" ||
      (filter === "overdue"
        ? r.due &&
          r.due < TODAY &&
          r.status !== "done" &&
          r.status !== "waiting"
        : filter === "issues"
          ? r.issues?.length > 0
          : r.status === filter || r.role === filter || r.stage === filter);
    return matches && text.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="standard-page">
      <PageHeading
        title={c.title}
        kicker={
          ["requests", "people", "companies"].includes(kind)
            ? "Продажи"
            : kind === "products" || kind === "rooms"
              ? "Каталог"
              : undefined
        }
        description={c.description}
        action={
          <Button
            disabled={!data.writeEnabled}
            title={
              !data.writeEnabled
                ? "Создание будет доступно после подключения записи"
                : undefined
            }
            icon={Plus}
            onClick={() => openPanel({ type: "create", kind: c.kind })}
          >
            {c.create}
          </Button>
        }
      />
      {kind === "orders" && (
        <div className="view-switch">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            Список
          </button>
          <button
            className={view === "production" ? "active" : ""}
            onClick={() => setView("production")}
          >
            Изготовление
          </button>
        </div>
      )}
      <Tabs
        items={c.tabs.map(([value, label]) => ({
          value,
          label,
          count: value === "all" ? source.length : undefined,
        }))}
        value={filter}
        onChange={setFilter}
      />
      <div className="list-toolbar">
        <div className="input-search">
          <MagnifyingGlass size={18} />
          <input
            aria-label={`Поиск: ${c.title}`}
            placeholder={`Найти ${kind === "people" ? "человека" : kind === "companies" ? "компанию" : kind === "orders" ? "заказ" : kind === "products" ? "товар" : "запись"}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted small">Найдено: {rows.length}</span>
      </div>
      {!rows.length ? (
        <Empty
          title={
            !source.length
              ? `${c.title}: записей пока нет`
              : "Ничего не найдено"
          }
          text={
            !source.length
              ? "Рабочая система вернула пустой список."
              : "Измените поиск или фильтр."
          }
          action={
            query || filter !== "all" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Сбросить фильтры
              </Button>
            ) : null
          }
        />
      ) : kind === "orders" && view === "production" ? (
        <div className="production-board">
          {STAGES.map((stage) => (
            <section key={stage}>
              <h3>
                {stage}
                <small>{rows.filter((r) => r.stage === stage).length}</small>
              </h3>
              {rows
                .filter((r) => r.stage === stage)
                .map((o) => (
                  <button
                    className="production-item"
                    key={o.id}
                    onClick={() => go("orders", o.id)}
                  >
                    <b>{o.id}</b>
                    <span>{o.title}</span>
                    <small>
                      {data.people.find((p) => p.id === o.personId)?.name}
                    </small>
                    <Badge tone={tone(o.payment)}>{o.payment}</Badge>
                  </button>
                ))}
            </section>
          ))}
        </div>
      ) : kind === "orders" ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Заказ / клиент</th>
                <th>Оплата</th>
                <th>Изготовление</th>
                <th>Доставка</th>
                <th>Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="table-link"
                      onClick={() => go(kind, r.id)}
                    >
                      {r.id} · {r.title}
                    </button>
                    <small>
                      {data.people.find((p) => p.id === r.personId)?.name}
                    </small>
                  </td>
                  <td>
                    <Badge tone={tone(r.payment)}>{r.payment}</Badge>
                  </td>
                  <td>
                    <Badge tone={tone(r.stage)}>{r.stage}</Badge>
                  </td>
                  <td>
                    <Badge tone="waiting">{r.delivery}</Badge>
                  </td>
                  <td className="money">
                    {r.totalMinor == null
                      ? "Не указана"
                      : new Intl.NumberFormat("ru-RU", {
                          style: "currency",
                          currency: r.currency || "RUB",
                        }).format(r.totalMinor / 100)}
                  </td>
                  <td>
                    <IconButton
                      icon={ArrowUpRight}
                      label={`Открыть ${r.id}`}
                      onClick={() => go(kind, r.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="object-list">
          {rows.map((r) => {
            const person = data.people.find((p) => p.id === r.personId);
            return (
              <button
                className="object-list-row"
                key={r.id}
                onClick={() => go(kind, r.id)}
              >
                <span
                  className={`object-icon ${kind === "people" ? "avatar" : ""}`}
                >
                  {kind === "people" ? (
                    r.initials || r.name.slice(0, 2)
                  ) : kind === "companies" ? (
                    <Buildings size={24} weight="light" />
                  ) : kind === "products" ? (
                    <Armchair size={24} weight="light" />
                  ) : kind === "rooms" ? (
                    <House size={24} weight="light" />
                  ) : (
                    <FileText size={24} weight="light" />
                  )}
                </span>
                <span className="object-list-copy">
                  <b>{r.title || r.name}</b>
                  <small>
                    {kind === "requests"
                      ? `${r.id} · ${person?.name || "Без контакта"} · ${r.source}`
                      : kind === "people"
                        ? `${r.role} · ${r.assignee}`
                        : kind === "companies"
                          ? `${r.type} · ${data.people.filter((p) => p.companyId === r.id).length} контактов`
                          : kind === "products"
                            ? `${r.sku} · ${typeLabel[r.type]} · ${r.collection}`
                            : `${r.compositionAvailable === false ? "Состав не передан" : r.productIds.length + " товаров"} · ${r.description}`}
                  </small>
                  {kind === "requests" && (
                    <span className="next-step">{r.next}</span>
                  )}
                </span>
                <span className="object-list-end">
                  {kind === "products" && (
                    <b className="money">
                      {r.priceLabel ||
                        (r.price ? money(Number(r.price) * 100) : "По запросу")}
                    </b>
                  )}
                  {r.status && (
                    <Badge tone={tone(r.status)}>
                      {r.statusLabel || STATUS[r.status] || r.status}
                    </Badge>
                  )}
                  {kind === "requests" && r.due && (
                    <small
                      className={
                        r.due < TODAY && r.status !== "done"
                          ? "critical-text"
                          : "muted"
                      }
                    >
                      {date(r.due)}
                    </small>
                  )}
                </span>
                <ArrowUpRight size={17} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
