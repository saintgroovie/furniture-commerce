import React from "react";
import { Button, Section, PageHeading, Empty, Badge } from "./ui.jsx";
export const ROLE_LABELS = {
  seller: "Продавец",
  production: "Производство",
  accountant: "Бухгалтер",
  director: "Директор",
  god: "Полный администратор",
};
const JOURNEYS = {
  seller: {
    title: "Продажи",
    note: "Клиент → компания → обращение → ответственный → документы.",
    steps: [
      ["companies", "Компании и партнёры"],
      ["people", "Клиенты и контакты"],
      ["requests", "Обращения и передача в работу"],
      ["orders", "Заказы"],
    ],
  },
  production: {
    title: "Мои работы",
    note: "Назначенные обращения и заказы. Спецификации, заметки и файлы доступны внутри работы.",
    steps: [
      ["requests", "Обращения в работе"],
      ["orders", "Назначенные заказы"],
      ["files", "Рабочие файлы"],
    ],
  },
  accountant: {
    title: "Бухгалтерия",
    note: "Реквизиты компаний, заказы и документы. Счета и оплаты из 1С появятся после подключения обмена.",
    steps: [
      ["companies", "Компании и реквизиты"],
      ["orders", "Заказы"],
      ["files", "Документы и вложения"],
      ["invoices", "Подключение счетов 1С"],
    ],
  },
  director: {
    title: "Обзор команды",
    note: "Обращения, ответственные, заказы и документы в общей базе.",
    steps: [
      ["requests", "Обращения и ответственные"],
      ["companies", "Компании"],
      ["orders", "Заказы"],
      ["team", "Команда и роли"],
    ],
  },
};
export function RoleHome({ data, go, openPanel }) {
  const journey = JOURNEYS[data.access.role];
  const work = [
    ...data.requests.map((x) => ({ ...x, kind: "requests" })),
    ...data.orders.map((x) => ({ ...x, kind: "orders" })),
  ];
  return (
    <div className="standard-page">
      <PageHeading
        title={journey.title}
        description={journey.note}
        action={
          data.capabilities.crmCreate ? (
            <Button
              onClick={() => openPanel({ type: "create", kind: "request" })}
            >
              Новое обращение
            </Button>
          ) : null
        }
      />
      <Section title="Рабочий путь">
        <div className="role-journey">
          {journey.steps.map(([page, label], index) => (
            <button key={page} className="role-step" onClick={() => go(page)}>
              <span className="muted small">{index + 1}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </Section>
      <Section
        title={data.access.assignedOnly ? "Назначено мне" : "Текущая работа"}
      >
        {work.length ? (
          <ul className="desk-items">
            {work.slice(0, 20).map((item) => (
              <li key={item.id}>
                <button
                  className="inline-link"
                  onClick={() => go(item.kind, item.id)}
                >
                  {item.title}
                </button>
                <span className="muted">{item.assignee}</span>
                <Badge>{item.statusLabel || item.stage}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={
              data.access.assignedOnly
                ? "Работы пока не назначены"
                : "Обращений и заказов пока нет"
            }
            text={
              data.access.assignedOnly
                ? "Продавец или директор назначит вас ответственным. После обновления работа появится здесь."
                : "Созданные коллегами записи появятся после обновления данных."
            }
          />
        )}
      </Section>
      {data.access.role === "director" && (
        <Section title="Общая база">
          <p>
            Компании: {data.companies.length} · Обращения:{" "}
            {data.requests.length} · Заказы: {data.orders.length} · Сотрудники:{" "}
            {data.staff.filter((s) => s.access?.enabled !== false).length}
          </p>
        </Section>
      )}
    </div>
  );
}
