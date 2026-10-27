import React, { useState, useEffect } from "react";
import { Button, Drawer, Field, FormError, Notice, Section } from "./ui.jsx";
import { useDeskCommand } from "./DeskTools.jsx";
import { toMinor } from "./model.mjs";
import { liveFetch } from "./storage.js";
import { changeOrderLine, invalidateOrderQuotes } from "./order-input.mjs";

const emptyLine = () => ({
  key: crypto.randomUUID(),
  productId: "",
  variantId: "",
  quantity: "1",
  price: "",
  quoteConfirmed: false,
});
const rub = (amount) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(
    amount,
  );
const available = (p) =>
  p.status === "published" &&
  ["STANDARD", "CONFIGURABLE", "BESPOKE"].includes(p.type);
export function OrderCreate({
  data,
  initialRequest,
  onClose,
  refresh,
  go,
  notify,
}) {
  const [requestId, setRequestId] = useState(initialRequest || "");
  const [lines, setLines] = useState(() => [emptyLine()]);
  const [notes, setNotes] = useState("");
  const [catalog, setCatalog] = useState(null),
    [catalogError, setCatalogError] = useState(""),
    [catalogRevision, setCatalogRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setCatalogError("");
    liveFetch("/api/live/order-catalog", { signal: controller.signal })
      .then((result) => {
        if (!Array.isArray(result.products))
          throw Error("Не удалось подтвердить каталог заказа");
        if (!controller.signal.aborted)
          setCatalog(
            result.products.map((p) => ({
              ...p,
              name: p.title,
              type: p.classification,
            })),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setCatalogError(e.message);
      });
    return () => controller.abort();
  }, [catalogRevision]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(null);
  const send = useDeskCommand();
  const request = data.requests.find((r) => r.id === requestId);
  const existing = data.orders.find((o) => o.requestId === requestId);
  const products = (catalog || []).filter(available);
  const patch = (key, change) =>
    setLines((rows) =>
      rows.map((l) => (l.key === key ? changeOrderLine(l, change) : l)),
    );
  const variantFor = (l) =>
    products
      .find((p) => p.id === l.productId)
      ?.variants.find((v) => v.id === l.variantId);
  const bespoke = (l) =>
    products.find((p) => p.id === l.productId)?.type === "BESPOKE";
  const amount = (l) => {
    if (!bespoke(l)) return variantFor(l)?.rub_price?.amount;
    try {
      return toMinor(l.price) / 100;
    } catch {
      return null;
    }
  };
  const valid =
    catalog !== null &&
    lines.every(
      (l) =>
        Number(amount(l)) > 0 &&
        (!bespoke(l) || (l.quoteConfirmed && notes.trim())) &&
        /^\d+$/.test(l.quantity) &&
        Number(l.quantity) > 0 &&
        Number(l.quantity) <= 10000,
    );
  const total = valid
    ? lines.reduce(
        (n, l) => n + Math.round(Number(amount(l)) * 100) * Number(l.quantity),
        0,
      ) / 100
    : null;
  async function openOrder(id) {
    await refresh();
    go("orders", id);
    onClose();
    notify("Заказ сохранён в Medusa");
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!request || !valid)
        throw Error("Выберите обращение, варианты и количество");
      const result = await send({
        type: "order.create",
        order: {
          requestId,
          expectedUpdatedAt: request.updatedAt,
          notes,
          lines: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId || null,
            quantity: Number(l.quantity),
            unitPriceMinor: Math.round(Number(amount(l)) * 100),
            quoteConfirmed: l.quoteConfirmed,
          })),
        },
      });
      const id = result.result.order.id;
      setCreated(id);
      await openOrder(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function repair() {
    setBusy(true);
    setError("");
    try {
      const result = await send({
        type: "order.create",
        order: existing.creationInput,
      });
      setCreated(result.result.order.id);
      await openOrder(result.result.order.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title="Заказ из обращения"
      kicker="Продажи"
      wide
      dirty={
        !created &&
        (Boolean(requestId) || Boolean(notes) || lines.some((l) => l.productId))
      }
      onClose={busy ? () => {} : onClose}
    >
      {created ? (
        <div className="form-stack">
          <Notice>Заказ уже сохранён. Повторно создавать его не нужно.</Notice>
          <FormError>{error}</FormError>
          <Button
            disabled={busy}
            onClick={() => openOrder(created).catch((e) => setError(e.message))}
          >
            Открыть заказ
          </Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          {!existing && catalog === null && !catalogError && (
            <p role="status">Загружаем базовые цены заказа…</p>
          )}
          <FormError>{catalogError}</FormError>
          {catalogError && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setCatalogRevision((n) => n + 1)}
            >
              Повторить загрузку цен
            </Button>
          )}
          <fieldset
            disabled={busy || (!existing && catalog === null)}
            className="order-form-fields"
          >
            <Field label="Обращение">
              <select
                required
                value={requestId}
                onChange={(e) => {
                  setRequestId(e.target.value);
                  setLines(invalidateOrderQuotes);
                }}
              >
                <option value="">Выберите обращение</option>
                {data.requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ·{" "}
                    {data.people.find((p) => p.id === r.personId)?.name || r.id}
                  </option>
                ))}
              </select>
            </Field>
            {existing ? (
              <Notice>
                <p>У этого обращения уже есть заказ.</p>
                {existing.setupPending && (
                  <>
                    <p>
                      Заказ создан, но сохранение назначения прервалось.
                      Завершите сохранение, чтобы его увидел назначенный
                      сотрудник.
                    </p>
                    <Button type="button" onClick={repair}>
                      Завершить сохранение
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  onClick={() => {
                    go("orders", existing.id);
                    onClose();
                  }}
                >
                  Открыть {existing.title}
                </Button>
              </Notice>
            ) : (
              <>
                <Notice>
                  Сохраняется черновик заказа. Компания и ответственный
                  переносятся из обращения; их можно изменить в карточке заказа.
                  Оплата, доставка и резервирование этим действием не
                  подтверждаются.
                </Notice>
                {request && (
                  <p className="muted">
                    Компания:{" "}
                    {data.companies.find((c) => c.id === request.companyId)
                      ?.name || "Без компании"}
                    . Ответственный: {request.assignee || "Не назначен"}.
                  </p>
                )}
                <Notice>
                  Для каталожных изделий берётся базовая цена в рублях без
                  персональных скидок и условий по количеству. Для изделий «По
                  проекту» укажите согласованную цену в позиции, а техническую
                  спецификацию для производства - ниже.
                </Notice>
                {lines.map((l, i) => (
                  <Section key={l.key} title={`Позиция ${i + 1}`}>
                    <div className="form-stack">
                      <Field label="Товар">
                        <select
                          required
                          value={l.productId}
                          onChange={(e) =>
                            patch(l.key, {
                              productId: e.target.value,
                              variantId: "",
                            })
                          }
                        >
                          <option value="">Выберите товар</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Вариант / исполнение">
                        <select
                          required={!bespoke(l)}
                          disabled={!l.productId}
                          value={l.variantId}
                          onChange={(e) =>
                            patch(l.key, { variantId: e.target.value })
                          }
                        >
                          <option value="">
                            {bespoke(l)
                              ? "По согласованной спецификации"
                              : "Выберите вариант"}
                          </option>
                          {(
                            products.find((p) => p.id === l.productId)
                              ?.variants || []
                          ).map((v) => (
                            <option
                              key={v.id}
                              value={v.id}
                              disabled={
                                !bespoke(l) &&
                                !(Number(v.rub_price?.amount) > 0)
                              }
                            >
                              {v.title === "Default"
                                ? "Базовое исполнение"
                                : v.title || "Вариант"}
                              {v.sku ? ` · ${v.sku}` : ""} ·{" "}
                              {Number(v.rub_price?.amount) > 0
                                ? rub(v.rub_price.amount)
                                : "Нет однозначной базовой цены"}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {bespoke(l) && (
                        <>
                          <Field label="Согласованная цена за единицу, ₽">
                            <input
                              required
                              inputMode="decimal"
                              value={l.price}
                              onChange={(e) =>
                                patch(l.key, {
                                  price: e.target.value,
                                  quoteConfirmed: false,
                                })
                              }
                            />
                          </Field>
                          <label>
                            <input
                              type="checkbox"
                              checked={l.quoteConfirmed}
                              onChange={(e) =>
                                patch(l.key, {
                                  quoteConfirmed: e.target.checked,
                                })
                              }
                            />{" "}
                            Цена и спецификация согласованы с клиентом
                          </label>
                        </>
                      )}
                      <Field label="Количество">
                        <input
                          required
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          inputMode="numeric"
                          value={l.quantity}
                          onChange={(e) =>
                            patch(l.key, { quantity: e.target.value })
                          }
                        />
                      </Field>
                      {amount(l) != null && (
                        <p>Цена за единицу: {rub(amount(l))}</p>
                      )}
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setLines((rows) =>
                              rows.filter((r) => r.key !== l.key),
                            )
                          }
                        >
                          Убрать позицию {i + 1}
                        </Button>
                      )}
                    </div>
                  </Section>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={lines.length >= 100}
                  onClick={() => setLines((rows) => [...rows, emptyLine()])}
                >
                  Добавить позицию
                </Button>
                <Field label="Спецификация и примечание для производства">
                  <textarea
                    rows={4}
                    maxLength={10000}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setLines(invalidateOrderQuotes);
                    }}
                  />
                </Field>
                <p>
                  <b>
                    Состав на сумму:{" "}
                    {total == null ? "выберите варианты" : rub(total)}
                  </b>
                </p>
                <p className="muted">
                  Файлы и счета добавляются в сохранённой карточке. Документы
                  обращения остаются связаны с исходным обращением.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCatalogRevision((n) => n + 1)}
                >
                  Обновить базовые цены
                </Button>
              </>
            )}
          </fieldset>
          <FormError>{error}</FormError>
          {!existing && (
            <Button type="submit" disabled={busy || !request || !valid}>
              {busy ? "Сохраняем…" : "Создать черновик заказа"}
            </Button>
          )}
        </form>
      )}
    </Drawer>
  );
}
