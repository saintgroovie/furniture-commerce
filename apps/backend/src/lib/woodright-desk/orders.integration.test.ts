import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
import { DESK_SCHEMA } from "./schema";
import { TEAM_SCHEMA } from "./team-schema";
import { INVOICE_SCHEMA } from "./invoice-schema";
import { createOrderFromRequest, type OrderPorts } from "./orders";
import { executeDeskCommand, type Sql } from "./commands";
import { authorizeDeskCommand, type StaffRole } from "./staff-access";
import { attachFile, PrivateFileStore } from "./private-files";
import { GET as download } from "../../api/admin/woodright/desk/attachments/[id]/content/route";
import { GET as invoices } from "../../api/admin/woodright/desk/invoices/route";

const url = new URL(
  process.env.WOODRIGHT_DESK_TEST_DATABASE_URL || "http://invalid",
);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/workspace_it_orders_[a-zA-Z0-9_]+$/.test(url.pathname)
)
  throw Error(
    "Orders tests require a NEW disposable local workspace_it_orders_* database",
  );
const db = knex({
  client: "pg",
  connection: url.toString(),
  pool: { min: 0, max: 6 },
});
const sql = db as unknown as Sql;
let directory: string,
  store: PrivateFileStore,
  createCount = 0;
const oldFeatures = process.env.WOODRIGHT_DESK_FEATURES,
  oldRoot = process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
const roles: StaffRole[] = [
  "seller",
  "production",
  "accountant",
  "director",
  "god",
];
const access = (role: StaffRole) => ({
  actorId: `staff_${role}`,
  role,
  enabled: true as const,
  version: 1,
});
const products = [
  {
    id: "prod_1",
    title: "Тестовый стол",
    status: "published",
    classification: "CONFIGURABLE",
    variants: [{ id: "variant_1", rub_price: { amount: 123.45 } }],
  },
  {
    id: "prod_bespoke",
    title: "Изделие по проекту",
    status: "published",
    classification: "BESPOKE",
    variants: [],
  },
];
// This adapter deliberately models the native workflow's independent commit. A separate
// Medusa runtime gate must prove the real workflow; these tests prove PostgreSQL desk recovery/RBAC.
const ports: OrderPorts = {
  products: async () => products,
  find: async (id) => (await db("order").where({ id }).first()) || null,
  create: async (input) => {
    createCount++;
    const order = {
      id: input.id,
      display_id: createCount,
      metadata: input.metadata,
      items: input.items,
    };
    await db("order").insert({ ...order, items: JSON.stringify(order.items) });
    return order;
  },
};
async function source(id: string) {
  await db("bespoke_request").insert({
    id,
    lead_id: "person_1",
    status: "new",
    updated_at: "2026-10-27T10:00:00Z",
  });
  await db("woodright_desk_record").insert({
    entity_type: "request",
    entity_id: id,
    company_id: "company_1",
    assignee_id: "staff_production",
  });
  return {
    type: "order.create",
    key: randomUUID(),
    order: {
      requestId: id,
      expectedUpdatedAt: "2026-10-27T10:00:00Z",
      notes: "",
      lines: [
        {
          productId: "prod_1",
          variantId: "variant_1",
          quantity: 2,
          unitPriceMinor: 12345,
        },
      ],
    },
  };
}
function req(role: StaffRole, params: any = {}) {
  return {
    params,
    query: {},
    auth_context: { actor_id: `staff_${role}`, actor_type: "user" },
    scope: {
      resolve: (name: string) =>
        name === "user"
          ? {
              retrieveUser: async () => ({
                id: `staff_${role}`,
                metadata: {
                  woodright_access: { role, enabled: true, version: 1 },
                },
              }),
            }
          : sql,
    },
  } as any;
}
function res() {
  return {
    statusCode: 200,
    body: null as any,
    headers: {} as any,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    json(v: any) {
      this.body = v;
    },
    send(v: any) {
      this.body = v;
    },
  } as any;
}
before(async () => {
  const count = (
    await db.raw(
      "select count(*)::int as n from information_schema.tables where table_schema='public'",
    )
  ).rows[0].n;
  assert.equal(count, 0, "Refuse to alter a non-empty test database");
  await db.raw(DESK_SCHEMA);
  await db.raw(TEAM_SCHEMA);
  await db.raw(INVOICE_SCHEMA);
  await db.raw(`create table "user" (id text primary key, deleted_at timestamptz, metadata jsonb);
    create table lead (id text primary key, name text, email text, deleted_at timestamptz);
    create table bespoke_request (id text primary key, lead_id text, status text, updated_at timestamptz, deleted_at timestamptz);
    create table "order" (id text primary key,display_id integer,metadata jsonb,items jsonb,deleted_at timestamptz);
    create table product_variant (id text primary key,deleted_at timestamptz);`);
  await db("user").insert(
    roles.map((role) => ({
      id: `staff_${role}`,
      metadata: { woodright_access: { role, enabled: true, version: 1 } },
    })),
  );
  await db("lead").insert({ id: "person_1", email: "customer@example.test" });
  await db("woodright_company").insert({
    id: "company_1",
    name: "Изолированная тестовая компания",
  });
  await db("product_variant").insert({ id: "variant_1" });
  directory = await mkdtemp(
    path.join(await realpath(tmpdir()), "woodright-orders-it-"),
  );
  store = new PrivateFileStore(directory);
  process.env.WOODRIGHT_DESK_FEATURES = "1";
  process.env.WOODRIGHT_PRIVATE_FILES_ROOT = directory;
});
after(async () => {
  await db.destroy();
  if (directory) await rm(directory, { recursive: true, force: true });
  if (oldFeatures === undefined) delete process.env.WOODRIGHT_DESK_FEATURES;
  else process.env.WOODRIGHT_DESK_FEATURES = oldFeatures;
  if (oldRoot === undefined) delete process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
  else process.env.WOODRIGHT_PRIVATE_FILES_ROOT = oldRoot;
});
test("two sellers concurrently create one order with persisted company and assignee; lost response replays", async () => {
  const command = await source("request_concurrent");
  const before = createCount;
  const results = await Promise.all([
    createOrderFromRequest(sql, "staff_seller", command, ports),
    createOrderFromRequest(
      sql,
      "staff_director",
      { ...command, key: randomUUID() },
      ports,
    ),
  ]);
  const id = (results[0].order as any).id;
  assert.equal((results[1].order as any).id, id);
  assert.equal(createCount - before, 1);
  const record = await db("woodright_desk_record")
    .where({ entity_type: "order", entity_id: id })
    .first();
  assert.equal(record.company_id, "company_1");
  assert.equal(record.assignee_id, "staff_production");
  const replay = await createOrderFromRequest(
    sql,
    "staff_seller",
    command,
    ports,
  );
  assert.equal(replay.replay, true);
  assert.equal(
    (await db("order").where({ id }).first()).metadata.woodright_os.person_id,
    "person_1",
  );
  assert.equal(
    (
      await db("woodright_desk_event").where({
        entity_id: id,
        action: "order.created_from_request",
      })
    ).length,
    1,
  );
  await assert.rejects(
    () =>
      createOrderFromRequest(
        sql,
        "staff_seller",
        { ...command, order: { ...command.order, notes: "Другое" } },
        ports,
      ),
    { code: "KEY_REUSED" },
  );
});
test("stale request and changed variant price fail before native order creation", async () => {
  const command = await source("request_stale");
  const before = createCount;
  await assert.rejects(
    () =>
      createOrderFromRequest(
        sql,
        "staff_seller",
        {
          ...command,
          order: {
            ...command.order,
            expectedUpdatedAt: "2026-10-26T10:00:00Z",
          },
        },
        ports,
      ),
    { status: 409 },
  );
  await assert.rejects(
    () =>
      createOrderFromRequest(
        sql,
        "staff_seller",
        {
          ...command,
          key: randomUUID(),
          order: {
            ...command.order,
            lines: [{ ...command.order.lines[0], unitPriceMinor: 1 }],
          },
        },
        ports,
      ),
    { status: 409 },
  );
  assert.equal(createCount, before);
});
test("interrupted desk commit is recoverable without a second native order", async () => {
  const command = await source("request_recover");
  let rejectOnce = true;
  const broken = {
    raw: db.raw.bind(db),
    transaction: (fn: any) =>
      db.transaction((trx) =>
        fn({
          raw: async (query: string, bindings: any[]) => {
            if (
              rejectOnce &&
              query.startsWith("insert into woodright_desk_record")
            ) {
              rejectOnce = false;
              throw Error("injected desk commit failure");
            }
            return trx.raw(query, bindings);
          },
          transaction: (fn: any) => trx.transaction(fn),
        }),
      ),
  } as unknown as Sql;
  const before = createCount;
  await assert.rejects(
    () => createOrderFromRequest(broken, "staff_seller", command, ports),
    /injected/,
  );
  assert.equal(createCount, before + 1);
  const recovered = await createOrderFromRequest(
    sql,
    "staff_seller",
    command,
    ports,
  );
  assert.equal(recovered.recovered, true);
  assert.equal(createCount, before + 1);
  assert.ok(
    await db("woodright_desk_record")
      .where({ entity_type: "order", entity_id: (recovered.order as any).id })
      .first(),
  );
});
test("bespoke order requires an explicit agreed price/specification and never invents a variant", async () => {
  const c = await source("request_bespoke");
  const line = {
    productId: "prod_bespoke",
    variantId: null,
    quantity: 1,
    unitPriceMinor: 54321,
    quoteConfirmed: true,
  };
  await assert.rejects(
    () =>
      createOrderFromRequest(
        sql,
        "staff_seller",
        { ...c, order: { ...c.order, lines: [line] } },
        ports,
      ),
    { status: 400 },
  );
  const r = await createOrderFromRequest(
    sql,
    "staff_seller",
    {
      ...c,
      key: randomUUID(),
      order: {
        ...c.order,
        notes: "Тестовая согласованная спецификация",
        lines: [line],
      },
    },
    ports,
  );
  const order = await db("order")
    .where({ id: (r.order as any).id })
    .first();
  assert.equal(order.items[0].variant_id, undefined);
  assert.equal(order.items[0].product_id, "prod_bespoke");
  assert.equal(order.items[0].unit_price, 543.21);
});
test("new order files persist, are shared with business roles and assigned production, and revoke on reassignment", async () => {
  const c = await source("request_files");
  const r = await createOrderFromRequest(sql, "staff_seller", c, ports);
  const id = (r.order as any).id;
  for (const visibility of ["business", "assigned"])
    await attachFile(
      sql,
      "staff_seller",
      {
        key: randomUUID(),
        id: `file_${visibility}`,
        entityType: "order",
        entityId: id,
        filename: `${visibility}.txt`,
        content: Buffer.from("Isolated order QA").toString("base64"),
        visibility,
      },
      store,
    );
  for (const role of roles) {
    const response = res();
    await download(req(role, { id: "file_assigned" }), response);
    assert.equal(response.statusCode, 200, role);
    assert.equal(response.body.toString(), "Isolated order QA");
  }
  const hidden = res();
  await download(req("production", { id: "file_business" }), hidden);
  assert.equal(hidden.statusCode, 403);
  const old = await db("woodright_desk_record")
    .where({ entity_type: "order", entity_id: id })
    .first();
  await executeDeskCommand(sql, "staff_seller", {
    type: "record.update",
    id,
    key: randomUUID(),
    entityType: "order",
    expectedVersion: old.version,
    ownership: { companyId: "company_1", assigneeId: "staff_seller" },
  });
  const revoked = res();
  await download(req("production", { id: "file_assigned" }), revoked);
  assert.equal(revoked.statusCode, 403);
});
test("invoice draft linked to new order persists for accountant; production cannot read invoices or create orders", async () => {
  const c = await source("request_invoice");
  const r = await createOrderFromRequest(sql, "staff_seller", c, ports);
  const id = (r.order as any).id;
  const invoice = {
    sourceType: "order",
    sourceId: id,
    companyId: "company_1",
    payer: { type: "person", name: "Изолированный тестовый плательщик" },
    lines: [
      {
        name: "Тестовый стол · вариант",
        quantity: "2",
        unitPriceMinor: 12345,
        variantId: "variant_1",
      },
    ],
    notes: "",
  };
  const cmd = {
    type: "invoice.create",
    id: "invoice_order_test",
    key: randomUUID(),
    invoice,
  };
  await authorizeDeskCommand(sql, access("seller"), cmd);
  await executeDeskCommand(sql, "staff_seller", cmd);
  const visible = res();
  await invoices(req("accountant"), visible);
  assert.equal(visible.statusCode, 200);
  assert.equal(visible.body.invoices[0].source_id, id);
  assert.equal(Number(visible.body.invoices[0].total_minor), 24690);
  const forbidden = res();
  await invoices(req("production"), forbidden);
  assert.equal(forbidden.statusCode, 403);
  await assert.rejects(
    () => authorizeDeskCommand(sql, access("production"), c),
    { status: 403 },
  );
  await assert.rejects(
    () => authorizeDeskCommand(sql, access("accountant"), c),
    { status: 403 },
  );
});
