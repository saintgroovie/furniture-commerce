import test from "node:test";
import assert from "node:assert/strict";
import { projectLive } from "../src/server/live-projection.mjs";
import { executeCommand } from "../src/server/live-command.mjs";
import { safeMediaUrl } from "../src/server/media-policy.mjs";
import {
  buildInvoiceIntent,
  validateInvoiceReceipt,
} from "../src/server/integrations/accounting-contract.mjs";
import {
  sameOriginAllowed,
  readJsonBounded,
} from "../src/server/request-policy.mjs";
import { todayGroups } from "../src/premium/model.mjs";
import { identityMatches } from "../src/server/runtime-identity.mjs";
test("a filled collection rejected by an old publish check is an integration discrepancy, not an owner data task", () => {
  const d = projectLive(
    {
      products: {
        products: [
          {
            id: "p",
            title: "Товар",
            collection_label: "Заполненная коллекция",
            publish: {
              ready: false,
              blockers: [
                { code: "missing_collection", message: "Не выбрана коллекция" },
              ],
            },
          },
        ],
      },
    },
    { email: "staff" },
    {},
    {},
  );
  assert.deepEqual(d.products[0].issues, []);
  assert.equal(d.products[0].integrationWarnings.length, 1);
  assert.equal(d.products[0].publishReady, false);
  const groups = todayGroups(d);
  assert.equal(groups[0].title, "Сверка подключения каталога");
  assert.equal(groups[0].items[0].systemReview, true);
});
test("live boundary refuses another database, environment or revision", () => {
  const env = {
    WOODRIGHT_DATA_ENVIRONMENT: "public_production",
    WOODRIGHT_EXPECTED_DATABASE_IDENTITY: "public_production_db",
    WOODRIGHT_EXPECTED_BACKEND_REVISION: "verified-sha",
  };
  const identity = {
    role: "public_production",
    databaseAlias: "public_production_db",
    backendRevision: "verified-sha",
  };
  assert.equal(identityMatches(identity, env), true);
  assert.equal(
    identityMatches({ ...identity, databaseAlias: "demo_db" }, env),
    false,
  );
  assert.equal(
    identityMatches({ ...identity, backendRevision: "new-sha" }, env),
    false,
  );
  assert.equal(identityMatches(identity, {}), false);
});
test("live queue uses actual statuses, without manufactured deadlines", () => {
  const groups = todayGroups({
    mode: "live",
    requests: [
      {
        id: "r",
        status: "new",
        statusLabel: "Новое",
        title: "Реальный запрос",
      },
    ],
    orders: [],
    products: [],
  });
  assert.equal(groups[0].title, "Новые обращения");
  assert.equal(groups[0].items[0].due, "");
  assert.equal(
    groups.some((g) => g.title === "Просрочено"),
    false,
  );
});
test("matching emails never silently create a CRM relation", () => {
  const d = projectLive(
    {
      people: {
        leads: [
          { id: "a", email: "same@example.test" },
          { id: "b", email: "same@example.test" },
        ],
      },
      orders: { orders: [{ id: "o", email: "same@example.test" }] },
    },
    { email: "staff@example.test" },
    {},
    {},
  );
  assert.equal(d.orders[0].personId, "");
  assert.equal(d.orders[0].email, "same@example.test");
});
test("CSRF origin is configured, not Next internal localhost or attacker Host", () => {
  const env = { WOODRIGHT_WORKSPACE_ORIGIN: "http://127.0.0.1:4320" };
  assert.equal(
    sameOriginAllowed(
      new Request("http://localhost:4320/api", {
        headers: { origin: "http://127.0.0.1:4320" },
      }),
      env,
    ),
    true,
  );
  assert.equal(
    sameOriginAllowed(
      new Request("http://localhost:4320/api", {
        headers: { origin: "https://other.example", host: "other.example" },
      }),
      env,
    ),
    false,
  );
  assert.equal(
    sameOriginAllowed(
      new Request("http://localhost:4320/api", {
        headers: {
          origin: "http://127.0.0.1:4320",
          "sec-fetch-site": "cross-site",
        },
      }),
      env,
    ),
    false,
  );
});
test("JSON limit holds without a content-length header", async () => {
  await assert.rejects(
    readJsonBounded(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(1000) }),
      }),
      100,
    ),
    /слишком большой/,
  );
  assert.deepEqual(
    await readJsonBounded(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      }),
      100,
    ),
    { ok: true },
  );
});
test("live projection does not fabricate CRM, due dates, invoice or payment facts", () => {
  const data = projectLive(
    {
      requests: {
        bespoke_requests: [
          { id: "r1", status: "paid", comment: "Расчёт", lead_id: "l1" },
        ],
      },
      orders: {
        orders: [
          {
            id: "o1",
            total: 12000.55,
            currency_code: "rub",
            payment_status: "not_paid",
            fulfillment_status: "delivered",
          },
        ],
      },
    },
    { email: "staff@example.test" },
    {},
    {},
  );
  assert.equal(data.requests[0].due, "");
  assert.equal(data.requests[0].status, "paid");
  assert.equal(data.orders[0].payment, "Не оплачен");
  assert.equal(data.orders[0].delivery, "Доставлен");
  assert.equal(data.orders[0].totalMinor, 1200055);
  assert.equal(data.orders[0].personId, "");
  assert.deepEqual(data.invoices, []);
  assert.deepEqual(data.companies, []);
});
test("ranges and server publication blockers survive UI projection", () => {
  const data = projectLive(
    {
      products: {
        products: [
          {
            id: "p1",
            title: "Товар",
            price_display: { kind: "range", min: 12000, max: 25000 },
            publish: { blockers: [{ message: "Нет артикулов" }], warnings: [] },
            variants: [],
          },
        ],
      },
    },
    { email: "staff@example.test" },
    {},
    {},
  );
  assert.match(data.products[0].priceLabel, /12.*25/);
  assert.deepEqual(data.products[0].issues, ["Нет артикулов"]);
  assert.equal(data.products[0].mainFileId, "");
});
test("orders without total are not shown as zero or line sum", () => {
  const data = projectLive(
    {
      orders: {
        orders: [
          { id: "o", items: [{ title: "X", quantity: 2, unit_price: 10 }] },
        ],
      },
    },
    { email: "x" },
    {},
    {},
  );
  assert.equal(data.orders[0].totalMinor, null);
});
test("media policy rejects off-origin, credentials and auth paths", () => {
  const base = "http://127.0.0.1:19300";
  assert.equal(safeMediaUrl("http://169.254.169.254/metadata", base), null);
  assert.equal(safeMediaUrl("https://x.test/secret", base), null);
  assert.equal(
    safeMediaUrl("http://a:b@127.0.0.1:19300/static/a.jpg", base),
    null,
  );
  assert.equal(safeMediaUrl("/admin/users", base), null);
  assert.equal(safeMediaUrl("/static/a.jpg", base)?.pathname, "/static/a.jpg");
  assert.ok(
    safeMediaUrl("https://media.example.test/a.jpg", base, [
      "https://media.example.test",
    ]),
  );
});
test("request stale check does not write", async () => {
  let writes = 0;
  await assert.rejects(
    executeCommand(
      {
        type: "request.update",
        id: "r1",
        expectedUpdatedAt: "old",
        status: "new",
        notes: "note",
      },
      {
        read: async () => ({ bespoke_request: { updated_at: "new" } }),
        send: async () => {
          writes++;
        },
      },
    ),
    (e) => e.status === 409,
  );
  assert.equal(writes, 0);
});
test("manufacturing command sends expected version and idempotency, without payment or notifications", async () => {
  let sent;
  await executeCommand(
    {
      type: "order.transition",
      id: "ord_1",
      stage: "quality_control",
      expectedVersion: 4,
      note: "Проверить",
      key: "operation-1234567890",
    },
    {
      read: async () => {
        throw new Error("Unexpected read");
      },
      send: async (...args) => {
        sent = args;
        return {};
      },
    },
  );
  assert.equal(sent[2].expected_version, 4);
  assert.equal(sent[2].notify_customer, false);
  assert.equal(sent[2].to_stage, "quality_control");
  assert.equal(sent[2].idempotency_key, "operation-1234567890");
  assert.equal(Object.hasOwn(sent[2], "payment_status"), false);
});
test("commands reject arbitrary entity updates and missing pause reason", async () => {
  const ports = {
    read: async () => ({}),
    send: async () => {
      throw new Error("must not write");
    },
  };
  await assert.rejects(
    executeCommand({ type: "data.replace", id: "r1" }, ports),
    (e) => e.status === 400,
  );
  await assert.rejects(
    executeCommand(
      {
        type: "order.transition",
        id: "r1",
        stage: "paused",
        expectedVersion: 1,
        note: "",
        key: "operation-12345678",
      },
      ports,
    ),
    /причину/,
  );
});
const input = {
  operationId: "operation-1234567890",
  source: { type: "order", id: "ord_1" },
  payer: { type: "person", name: "Тестовый плательщик" },
  lines: [
    {
      name: "Позиция",
      quantity: "2",
      unitPriceMinor: 1250050,
      accountingItemId: "one-c-item-1",
      accountingVatCode: "one-c-confirmed-tax-code",
    },
  ],
};
test("1C intent has stable identity, exact kopeks and no invented invoice or bank data", () => {
  const first = buildInvoiceIntent(input),
    second = buildInvoiceIntent(input);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.externalId, "woodright:operation-1234567890");
  assert.equal(first.lines[0].unitPriceMinor, 1250050);
  assert.equal(Object.hasOwn(first, "number"), false);
  assert.equal(Object.hasOwn(first.seller, "bankAccount"), false);
  assert.equal(Object.hasOwn(first, "paid"), false);
});
test("1C mapping is required and mismatched receipt never confirms an invoice", () => {
  assert.throws(
    () =>
      buildInvoiceIntent({
        ...input,
        lines: [{ ...input.lines[0], accountingItemId: "" }],
      }),
    /номенклатуре/,
  );
  assert.throws(
    () =>
      validateInvoiceReceipt(
        {
          externalId: "other",
          number: "1",
          accountingId: "a",
          currency: "RUB",
          totalMinor: 100,
        },
        "expected",
      ),
    /не подтвердила/,
  );
});
