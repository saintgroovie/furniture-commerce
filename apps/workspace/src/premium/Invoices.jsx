import React, { useRef, useState } from "react";
import {
  Button,
  Badge,
  Definition,
  Empty,
  Field,
  FormError,
  Notice,
  PageHeading,
  Section,
} from "./ui.jsx";
import { Attachments, useDeskCommand } from "./DeskTools.jsx";
import { History } from "./History.jsx";
import { date, money, TODAY, toMinor } from "./model.mjs";
import { invoiceInputLines } from "./invoice-input.mjs";
import { workspacePath } from "../lib/paths.mjs";

const labels = {
  draft: "Черновик",
  registered: "Счёт из 1С",
  archived: "В архиве",
};
const sourcePage = (t) => (t === "order" ? "orders" : "requests");
const sourceName = (data, type, id) =>
  data[sourcePage(type)].find((r) => r.id === id)?.title ||
  `${type === "order" ? "Заказ" : "Обращение"} · ${id}`;
const emptyLine = () => ({
  key: crypto.randomUUID(),
  name: "",
  quantity: "1",
  price: "",
  variantId: null,
});
function fieldsFor(data, invoice, initialSource) {
  const item = [...data.requests, ...data.orders].find(
    (r) => r.id === initialSource,
  );
  const type =
    invoice?.sourceType ||
    (data.access?.role === "accountant" ||
    data.orders.some((r) => r.id === initialSource)
      ? "order"
      : "request");
  const company = data.companies.find(
    (c) => c.id === (invoice?.companyId || item?.companyId),
  );
  const person = data.people.find((p) => p.id === item?.personId);
  return {
    sourceType: type,
    sourceId: invoice?.sourceId || item?.id || "",
    companyId: invoice?.companyId || company?.id || "",
    payer: invoice?.payer || {
      type: company
        ? company.taxId?.length === 12
          ? "entrepreneur"
          : "company"
        : "person",
      name: company?.legalName || company?.name || person?.name || "",
      inn: company?.taxId || "",
      kpp: company?.kpp || "",
      address: company?.address || "",
    },
    lines:
      invoice?.lines.map((l) => ({
        ...l,
        key: crypto.randomUUID(),
        price: String(l.unitPriceMinor / 100),
      })) ||
      (item?.lines?.length
        ? item.lines.map((l) => ({
            ...emptyLine(),
            name: l.name,
            quantity: String(l.qty),
            price: l.price,
          }))
        : [emptyLine()]),
    notes: invoice?.notes || "",
  };
}
export function InvoiceEditor({
  data,
  invoice,
  initialSource,
  go,
  refresh,
  notify,
  onClose,
}) {
  const [form, setForm] = useState(() =>
      fieldsFor(data, invoice, initialSource),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState(null);
  const fixedId = useRef(invoice?.id || `invoice_${crypto.randomUUID()}`),
    version = useRef(invoice?.version);
  const send = useDeskCommand();
  const patch = (p) => {
    setForm((f) => ({ ...f, ...p }));
    setError("");
  };
  const payer = (p) => setForm((f) => ({ ...f, payer: { ...f.payer, ...p } }));
  const line = (key, p) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.key === key ? { ...l, ...p } : l)),
    }));
  const chooseCompany = (id) => {
    const c = data.companies.find((c) => c.id === id);
    patch({
      companyId: id,
      ...(c
        ? {
            payer: {
              type: c.taxId?.length === 12 ? "entrepreneur" : "company",
              name: c.legalName || c.name,
              inn: c.taxId,
              kpp: c.kpp,
              address: c.address,
            },
          }
        : {}),
    });
  };
  let total = null;
  try {
    total = invoiceInputLines(form.lines).totalMinor;
  } catch {}
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const prepared = invoiceInputLines(form.lines);
      const result = await send({
        type: invoice ? "invoice.update" : "invoice.create",
        id: fixedId.current,
        ...(invoice ? { expectedVersion: version.current } : {}),
        invoice: {
          sourceType: form.sourceType,
          sourceId: form.sourceId,
          companyId: form.companyId || null,
          payer: form.payer,
          lines: prepared.lines,
          notes: form.notes,
        },
      });
      await refresh();
      notify("Черновик счёта сохранён в общей базе");
      onClose?.();
      go("invoices", result.result.invoice.id);
    } catch (e) {
      setError(e.message);
      if (e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="standard-page">
      <PageHeading
        title={invoice ? "Редактирование черновика" : "Новый черновик счёта"}
        description="Официальный документ выставляется в 1С. Здесь сохраняется подготовка и связь с рабочими карточками."
        action={
          <Button
            variant="secondary"
            onClick={() => (onClose ? onClose() : go("invoices"))}
          >
            Назад
          </Button>
        }
      />
      <form onSubmit={save} className="form-stack">
        <Section title="Обращение или заказ">
          <div className="invoice-form-grid">
            <Field label="Основание">
              <select
                value={form.sourceType}
                onChange={(e) =>
                  patch({ sourceType: e.target.value, sourceId: "" })
                }
              >
                {(!data.access ||
                  data.access.pages.includes("requests") ||
                  invoice?.sourceType === "request") && (
                  <option value="request">Обращение</option>
                )}
                <option value="order">Заказ</option>
              </select>
            </Field>
            <Field label="Связанная карточка">
              <select
                required
                value={form.sourceId}
                onChange={(e) => patch({ sourceId: e.target.value })}
              >
                <option value="">Выберите карточку</option>
                {data[sourcePage(form.sourceType)].map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                {invoice &&
                  !data[sourcePage(form.sourceType)].some(
                    (r) => r.id === form.sourceId,
                  ) && (
                    <option value={form.sourceId}>
                      {sourceName(data, form.sourceType, form.sourceId)}
                    </option>
                  )}
              </select>
            </Field>
          </div>
        </Section>
        <Section title="Плательщик">
          <div className="invoice-form-grid">
            <Field label="Компания в OS">
              <select
                value={form.companyId}
                onChange={(e) => chooseCompany(e.target.value)}
              >
                <option value="">Без компании</option>
                {data.companies
                  .filter(
                    (c) => c.status === "active" || c.id === form.companyId,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Тип плательщика">
              <select
                value={form.payer.type}
                onChange={(e) => payer({ type: e.target.value })}
              >
                <option value="person">Физическое лицо</option>
                <option value="company">Организация</option>
                <option value="entrepreneur">ИП</option>
              </select>
            </Field>
            <Field label="Имя или полное наименование">
              <input
                required
                maxLength={300}
                value={form.payer.name}
                onChange={(e) => payer({ name: e.target.value })}
              />
            </Field>
            <Field label="ИНН">
              <input
                required={form.payer.type !== "person"}
                inputMode="numeric"
                maxLength={12}
                value={form.payer.inn}
                onChange={(e) => payer({ inn: e.target.value })}
              />
            </Field>
            <Field label="КПП">
              <input
                inputMode="numeric"
                maxLength={9}
                value={form.payer.kpp}
                onChange={(e) => payer({ kpp: e.target.value })}
              />
            </Field>
            <Field label="Адрес плательщика">
              <input
                maxLength={1000}
                value={form.payer.address}
                onChange={(e) => payer({ address: e.target.value })}
              />
            </Field>
          </div>
          <p className="muted small">
            Реквизиты сохраняются в этом счёте. Последующее изменение компании
            не переписывает готовый документ.
          </p>
        </Section>
        <Section title="Позиции">
          <div className="invoice-lines">
            {form.lines.map((l, index) => (
              <div className="invoice-line" key={l.key}>
                <Field label={`Позиция ${index + 1}`}>
                  <input
                    required
                    maxLength={500}
                    value={l.name}
                    onChange={(e) =>
                      line(l.key, { name: e.target.value, variantId: null })
                    }
                  />
                </Field>
                <Field label="Количество">
                  <input
                    required
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => line(l.key, { quantity: e.target.value })}
                  />
                </Field>
                <Field label="Цена, ₽">
                  <input
                    required
                    inputMode="decimal"
                    value={l.price}
                    onChange={(e) => line(l.key, { price: e.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={form.lines.length === 1 || busy}
                  onClick={() =>
                    patch({ lines: form.lines.filter((x) => x.key !== l.key) })
                  }
                  aria-label={`Убрать позицию ${index + 1}`}
                >
                  Убрать
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || form.lines.length >= 200}
            onClick={() => patch({ lines: [...form.lines, emptyLine()] })}
          >
            Добавить позицию
          </Button>
          <p className="invoice-total">
            Итого{" "}
            <strong>
              {total === null ? "Заполните позиции" : money(total)}
            </strong>
          </p>
          <p className="muted small">
            Количество — до трёх знаков после запятой, цена — до копеек. Налоги
            и реквизиты оплаты берутся из официального документа 1С.
          </p>
        </Section>
        <Section title="Примечание">
          <Field label="Внутренняя заметка">
            <textarea
              rows={3}
              maxLength={10000}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
        </Section>
        <FormError>{error}</FormError>
        {conflict && (
          <Notice tone="warning">
            На сервере появилась другая версия. Ваши поля остались в форме.
            Обновите данные и сверьте изменения перед новым сохранением.
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  const next = await refresh();
                  const saved = next.invoices.find(
                    (i) => i.id === fixedId.current,
                  );
                  if (saved) {
                    if (!invoice) {
                      onClose?.();
                      go("invoices", saved.id);
                      return;
                    }
                    setServerSnapshot(saved);
                  }
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Загрузить текущую версию
            </Button>
            {serverSnapshot && (
              <div>
                <p>
                  <strong>Сейчас в базе:</strong> {serverSnapshot.payer.name} ·{" "}
                  {money(serverSnapshot.totalMinor)} ·{" "}
                  {labels[serverSnapshot.status]}
                </p>
                <ul>
                  {serverSnapshot.lines.map((l, i) => (
                    <li key={i}>
                      {l.name} · {l.quantity} × {money(l.unitPriceMinor)}
                    </li>
                  ))}
                </ul>
                <p className="preserve-lines">{serverSnapshot.notes}</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    version.current = serverSnapshot.version;
                    setServerSnapshot(null);
                    setConflict(false);
                    setError("");
                  }}
                >
                  Я сверил изменения, продолжить с моими полями
                </Button>
              </div>
            )}
          </Notice>
        )}
        <Button
          type="submit"
          disabled={busy || conflict || !data.capabilities.invoiceDraft}
        >
          {busy ? "Сохраняем…" : "Сохранить черновик"}
        </Button>
      </form>
    </div>
  );
}
function Registration({ invoice, data, files, refresh, notify }) {
  const [number, setNumber] = useState(""),
    [documentDate, setDate] = useState(TODAY),
    [total, setTotal] = useState(String(invoice.totalMinor / 100)),
    [reference, setReference] = useState(""),
    [attachmentId, setAttachment] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = useDeskCommand();
  if (invoice.status !== "draft") return null;
  if (!data.capabilities.invoiceRegister)
    return (
      <Notice>
        Бухгалтер или полный администратор сможет зарегистрировать готовый счёт
        из 1С после прикрепления PDF.
      </Notice>
    );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send({
        type: "invoice.register",
        id: invoice.id,
        expectedVersion: invoice.version,
        number,
        documentDate,
        accountingRef: reference,
        attachmentId,
        documentTotalMinor: toMinor(total),
        confirmedFrom1C: confirmed,
      });
      await refresh();
      notify("Документ из 1С зарегистрирован. Оплата не подтверждалась");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Зарегистрировать готовый счёт из 1С">
      <p className="muted">
        Перенесите номер, дату и итоговую сумму из документа, который уже
        выставлен в 1С. PDF сохраняется вместе со счётом.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <div className="invoice-form-grid">
          <Field label="Номер из 1С">
            <input
              required
              maxLength={100}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </Field>
          <Field label="Дата документа">
            <input
              type="date"
              required
              value={documentDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Итоговая сумма в PDF, ₽">
            <input
              required
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
          <Field label="Идентификатор в 1С, если известен">
            <input
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Прикреплённый PDF">
            <select
              required
              value={attachmentId}
              onChange={(e) => setAttachment(e.target.value)}
            >
              <option value="">Выберите PDF из вложений ниже</option>
              {files
                .filter((f) => /\.pdf$/i.test(f.filename))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          Номер, дата и сумма перенесены из реального счёта 1С
        </label>
        <FormError>{error}</FormError>
        <Button type="submit" disabled={busy || !confirmed || !attachmentId}>
          {busy ? "Регистрируем…" : "Зарегистрировать документ"}
        </Button>
      </form>
    </Section>
  );
}
function InvoiceDetail({ invoice, data, go, refresh, notify }) {
  const [editing, setEditing] = useState(false),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = useDeskCommand();
  if (editing)
    return (
      <InvoiceEditor
        data={data}
        invoice={invoice}
        go={go}
        refresh={refresh}
        notify={notify}
        onClose={() => setEditing(false)}
      />
    );
  async function archive() {
    setBusy(true);
    setError("");
    try {
      await send({
        type: "invoice.archive",
        id: invoice.id,
        expectedVersion: invoice.version,
        archived: invoice.status !== "archived",
      });
      await refresh();
      notify(
        invoice.status === "archived"
          ? "Счёт возвращён из архива"
          : "Счёт перемещён в архив OS",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const canArchive =
    data.capabilities.invoiceDraft &&
    (!invoice.number || data.access?.role !== "seller");
  return (
    <div className="standard-page">
      <PageHeading
        title={invoice.number ? `Счёт № ${invoice.number}` : "Черновик счёта"}
        description={sourceName(data, invoice.sourceType, invoice.sourceId)}
        action={
          <Button variant="secondary" onClick={() => go("invoices")}>
            Все счета
          </Button>
        }
      />
      <Section title="Документ">
        <div className="invoice-detail-top">
          <Badge>{labels[invoice.status]}</Badge>
          <strong className="invoice-amount">
            {money(invoice.totalMinor)}
          </strong>
        </div>
        <Definition
          items={[
            ["Плательщик", invoice.payer.name],
            ["ИНН", invoice.payer.inn || "Не указан"],
            ["КПП", invoice.payer.kpp || "Не указан"],
            ["Адрес", invoice.payer.address || "Не указан"],
            ...(invoice.number
              ? [
                  ["Дата документа", date(invoice.documentDate, true)],
                  ["Источник", "1С · добавлен вручную"],
                ]
              : []),
            [
              "Подготовил",
              data.staff.find((s) => s.id === invoice.createdBy)?.name ||
                "Сотрудник",
            ],
          ]}
        />
        <div className="action-row">
          {invoice.status === "draft" && data.capabilities.invoiceDraft && (
            <Button onClick={() => setEditing(true)}>
              Редактировать черновик
            </Button>
          )}
          {invoice.attachmentId && (
            <a
              className="btn secondary"
              href={workspacePath(
                `/api/live/attachments/${encodeURIComponent(invoice.attachmentId)}`,
              )}
              download
            >
              Скачать PDF из 1С
            </a>
          )}
          {canArchive && (
            <Button variant="secondary" disabled={busy} onClick={archive}>
              {invoice.status === "archived"
                ? "Вернуть из архива"
                : "В архив OS"}
            </Button>
          )}
        </div>
        <FormError>{error}</FormError>
        <p className="muted small">
          Оплаты и поступления пока не синхронизируются. Архив OS сохраняет
          документ и не отменяет его в 1С.
        </p>
      </Section>
      <Section title="Позиции">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Наименование</th>
                <th>Количество</th>
                <th>Цена</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td>
                  <td>{l.quantity}</td>
                  <td>{money(l.unitPriceMinor)}</td>
                  <td>{money(l.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invoice.notes && <p className="preserve-lines">{invoice.notes}</p>}
      </Section>
      <Registration
        invoice={invoice}
        data={data}
        files={files}
        refresh={refresh}
        notify={notify}
      />
      <Attachments
        type="invoice"
        id={invoice.id}
        data={data}
        refresh={refresh}
        notify={notify}
        onLoaded={setFiles}
      />
      <History
        type="invoice"
        id={invoice.id}
        updatedAt={data.loadedAt}
        data={data}
      />
    </div>
  );
}
export function Invoices({ data, id, go, refresh, notify }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("active");
  if (!data.capabilities.documents)
    return (
      <div className="standard-page">
        <PageHeading title="Счета" />
        <Notice>
          Сохранение счетов появится после установки обновления рабочей базы.
          Автоматический обмен с 1С ожидает подключения.
        </Notice>
      </div>
    );
  if (id === "new")
    return (
      <InvoiceEditor data={data} go={go} refresh={refresh} notify={notify} />
    );
  if (id) {
    const invoice = data.invoices.find((i) => i.id === id);
    return invoice ? (
      <InvoiceDetail
        key={id}
        invoice={invoice}
        data={data}
        go={go}
        refresh={refresh}
        notify={notify}
      />
    ) : (
      <Empty
        title="Счёт не найден"
        text="Обновите данные или вернитесь к списку."
        action={<Button onClick={() => go("invoices")}>Все счета</Button>}
      />
    );
  }
  const rows = data.invoices.filter(
    (i) =>
      (status === "all" || status === "active"
        ? status === "all" || i.status !== "archived"
        : i.status === status) &&
      `${i.number} ${i.payer.name} ${i.payer.inn} ${sourceName(data, i.sourceType, i.sourceId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="standard-page">
      <PageHeading
        title="Счета"
        description="Черновики команды и готовые документы из 1С. Подтверждение оплаты появится после подключения обмена."
        action={
          <Button
            disabled={!data.capabilities.invoiceDraft}
            onClick={() => go("invoices", "new")}
          >
            Новый черновик
          </Button>
        }
      />
      <div className="invoice-form-grid">
        <Field label="Поиск счетов">
          <input
            type="search"
            placeholder="Номер, плательщик, ИНН или обращение"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field label="Статус счёта">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Действующие</option>
            <option value="draft">Черновики</option>
            <option value="registered">Из 1С</option>
            <option value="archived">Архив</option>
            <option value="all">Все</option>
          </select>
        </Field>
      </div>
      {rows.length ? (
        <ul className="desk-items invoice-list">
          {rows.map((i) => (
            <li key={i.id}>
              <button
                className="invoice-list-link"
                onClick={() => go("invoices", i.id)}
              >
                <span>
                  <strong>
                    {i.number ? `№ ${i.number}` : "Черновик счёта"} ·{" "}
                    {i.payer.name}
                  </strong>
                  <small>
                    {sourceName(data, i.sourceType, i.sourceId)} ·{" "}
                    {date(i.updatedAt)}
                  </small>
                </span>
                <span>
                  <Badge>{labels[i.status]}</Badge>
                  <strong>{money(i.totalMinor)}</strong>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={query ? "Счета не найдены" : "Счетов пока нет"}
          text={
            query
              ? "Измените поиск или статус."
              : "Подготовьте черновик из обращения или заказа. Он сохранится в общей базе."
          }
        />
      )}
    </div>
  );
}
