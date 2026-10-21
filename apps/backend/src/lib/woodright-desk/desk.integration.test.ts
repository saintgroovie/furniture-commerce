import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
import { DESK_SCHEMA } from "./schema";
import { TEAM_SCHEMA } from "./team-schema";
import { GET as listStaff } from "../../api/admin/woodright/desk/staff/route";
import { MANGO_SCHEMA } from "./mango-schema";
import { mangoSignature, receiveMangoCall } from "./mango";
import { DeskError, executeDeskCommand, type Sql } from "./commands";
import {
  attachFile,
  decodeAttachment,
  MAX_ATTACHMENT_BYTES,
  PrivateFileStore,
  removeAttachment,
} from "./private-files";
import { deskContext } from "./http";
import { GET as download } from "../../api/admin/woodright/desk/attachments/[id]/content/route";
import { GET as listReminders } from "../../api/admin/woodright/desk/reminders/route";
import { GET as listAttachments } from "../../api/admin/woodright/desk/attachments/route";
import { GET as listFiles } from "../../api/admin/woodright/desk/files/route";
import { GET as listHistory } from "../../api/admin/woodright/desk/history/route";

const databaseUrl = process.env.WOODRIGHT_DESK_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "WOODRIGHT_DESK_TEST_DATABASE_URL must point to a disposable workspace_it database",
  );
const parsed = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  !/^\/workspace_it[a-zA-Z0-9_]*$/.test(parsed.pathname)
)
  throw new Error(
    "Desk integration tests only accept a local disposable workspace_it database",
  );
const db = knex({
  client: "pg",
  connection: databaseUrl,
  pool: { min: 0, max: 6 },
});
const sql = db as unknown as Sql;
let directory: string, store: PrivateFileStore;
const oldFlag = process.env.WOODRIGHT_DESK_FEATURES,
  oldRoot = process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
const key = () => randomUUID();
const command = (extra = {}) => ({
  type: "request.update",
  id: "request_1",
  status: "contacted",
  notes: "Заметки сотрудника",
  key: key(),
  expectedUpdatedAt: "2026-10-19T10:00:00.000Z",
  ...extra,
});
function request(
  query: Record<string, unknown> = {},
  params = {},
  actorType = "user",
) {
  return {
    query,
    params,
    auth_context: { actor_id: "staff_1", actor_type: actorType },
    scope: {
      resolve: (name: string) => {
        if (name === "user")
          return {
            retrieveUser: async () => ({
              id: "staff_1",
              email: "staff@example.test",
              metadata: {
                woodright_access: { role: "god", enabled: true, version: 1 },
              },
            }),
          };
        return sql;
      },
    },
  } as any;
}
function response() {
  return {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as any,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    send(body: any) {
      this.body = body;
      return this;
    },
  } as any;
}
before(async () => {
  await db.raw(DESK_SCHEMA);
  await db.raw("drop table if exists woodright_desk_record, woodright_company");
  await db.raw(TEAM_SCHEMA);
  await db.raw(`create table if not exists "user" (id text primary key,email text,first_name text,last_name text,deleted_at timestamptz, metadata jsonb);
    alter table "user" add column if not exists metadata jsonb;
    insert into "user"(id,email,first_name) values ('staff_1','staff@example.test','Первый'),('staff_2','second@example.test','Второй') on conflict(id) do nothing;
    insert into "user"(id,email,deleted_at) values ('staff_deleted','removed@example.test',now()) on conflict(id) do nothing;`);
  await db.raw(
    `update "user" set metadata = '{"woodright_access":{"role":"god","enabled":true,"version":1}}'::jsonb where id in ('staff_1','staff_2')`,
  );
  await db.raw(MANGO_SCHEMA);
  await db.raw("truncate woodright_mango_event, woodright_mango_call");
  await db.raw(`create table if not exists bespoke_request (id text primary key, lead_id text null, comment text null, dimensions text null, materials text null, budget text null, status text not null, internal_notes text null,
    quoted_at timestamptz null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);
    create table if not exists lead (id text primary key, source text, name text, email text, phone text, comment text, payload jsonb, status text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);
    create table if not exists "order" (id text primary key, deleted_at timestamptz null);`);
  await db.raw(`truncate woodright_follow_up, woodright_private_attachment, woodright_desk_event, woodright_desk_operation, bespoke_request, lead, "order";
    insert into bespoke_request (id, status, updated_at) values ('request_1', 'new', '2026-10-19T10:00:00Z');
    insert into lead (id) values ('person_1'); insert into "order" (id) values ('order_1');`);
  directory = await mkdtemp(
    path.join(await realpath(tmpdir()), "woodright-desk-files-"),
  );
  store = new PrivateFileStore(directory);
  process.env.WOODRIGHT_DESK_FEATURES = "1";
  process.env.WOODRIGHT_PRIVATE_FILES_ROOT = directory;
});
after(async () => {
  await db.destroy();
  if (directory) await rm(directory, { recursive: true, force: true });
  if (oldFlag === undefined) delete process.env.WOODRIGHT_DESK_FEATURES;
  else process.env.WOODRIGHT_DESK_FEATURES = oldFlag;
  if (oldRoot === undefined) delete process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
  else process.env.WOODRIGHT_PRIVATE_FILES_ROOT = oldRoot;
});
test("simultaneous request editors: exactly one wins, stale notes never overwrite", async () => {
  const results = await Promise.allSettled([
    executeDeskCommand(sql, "staff_1", command()),
    executeDeskCommand(sql, "staff_2", command({ notes: "Другой текст" })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(failure.reason.code, "STALE_VERSION");
  const row = (
    await db.raw("select * from bespoke_request where id = 'request_1'")
  ).rows[0];
  assert.equal(row.status, "contacted");
  assert.ok(row.updated_at.toISOString() > "2026-10-19T10:00:00.000Z");
  assert.equal(
    (await db("woodright_desk_event").count("*").first())?.count,
    "1",
  );
});
test("lost response replay is idempotent and a changed payload cannot reuse a key", async () => {
  const current = (await db("bespoke_request").first())!;
  const input = command({
    expectedUpdatedAt: current.updated_at.toISOString(),
    notes: "Повторяемое сохранение",
  });
  const first = await executeDeskCommand(sql, "staff_1", input);
  const replay = await executeDeskCommand(sql, "staff_1", input);
  assert.equal(replay.replay, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(first.bespoke_request)),
    replay.bespoke_request,
  );
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", { ...input, notes: "Подмена" }),
    (e: any) => e.code === "KEY_REUSED",
  );
});
test("audit failure rolls back the business change and operation receipt together", async () => {
  const current = (await db("bespoke_request").first())!;
  await db.raw(`create function desk_test_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'test audit fault'; end $$;
    create trigger desk_test_audit_fault before insert on woodright_desk_event for each row execute function desk_test_fail_audit();`);
  const count = await db("woodright_desk_operation").count("*").first();
  try {
    await assert.rejects(
      executeDeskCommand(
        sql,
        "staff_1",
        command({
          expectedUpdatedAt: current.updated_at.toISOString(),
          notes: "Не должно сохраниться",
        }),
      ),
    );
    assert.equal(
      (await db("bespoke_request").first())?.internal_notes,
      current.internal_notes,
    );
    assert.deepEqual(
      await db("woodright_desk_operation").count("*").first(),
      count,
    );
  } finally {
    await db.raw(
      "drop trigger desk_test_audit_fault on woodright_desk_event; drop function desk_test_fail_audit();",
    );
  }
});
test("request status cannot manufacture a confirmed accounting payment", async () => {
  const current = (await db("bespoke_request").first())!;
  await assert.rejects(
    executeDeskCommand(
      sql,
      "staff_1",
      command({
        expectedUpdatedAt: current.updated_at.toISOString(),
        status: "paid",
      }),
    ),
    (e: any) => e.code === "ACCOUNTING_REQUIRED",
  );
  assert.equal((await db("bespoke_request").first())?.status, "contacted");
});
test("persistent reminders validate real entities, date, replay, completion, stale version and undo", async () => {
  const input = {
    type: "reminder.create",
    id: "follow_1",
    entityType: "request",
    entityId: "request_1",
    dueOn: "2026-10-21",
    summary: "Согласовать размеры",
    key: key(),
  };
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", { ...input, dueOn: "2026-02-30" }),
    (e: any) => e.code === "INVALID_DATE",
  );
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", { ...input, entityId: "missing" }),
    (e: any) => e.status === 404,
  );
  const created = (await executeDeskCommand(sql, "staff_1", input)) as any;
  assert.equal(
    new Date(created.reminder.due_at).toISOString(),
    "2026-10-21T06:00:00.000Z",
  );
  assert.equal((await executeDeskCommand(sql, "staff_1", input)).replay, true);
  await executeDeskCommand(sql, "staff_1", {
    type: "reminder.update",
    id: "follow_1",
    status: "done",
    expectedVersion: 1,
    key: key(),
  });
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      type: "reminder.update",
      id: "follow_1",
      status: "cancelled",
      expectedVersion: 1,
      key: key(),
    }),
    (e: any) => e.status === 409,
  );
  await executeDeskCommand(sql, "staff_1", {
    type: "reminder.update",
    id: "follow_1",
    status: "open",
    expectedVersion: 2,
    key: key(),
  });
  const res = response();
  await listReminders(request({ limit: "1", offset: "0" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.reminders[0].version, 3);
});
test("file upload is private, immutable, idempotent, exact-byte downloadable, and soft-removable", async () => {
  const bytes = Buffer.from("%PDF-1.7\nПриватный договор Woodright\n%%EOF");
  const input = {
    type: "attachment.upload",
    id: "file_1",
    entityType: "request",
    entityId: "request_1",
    filename: "Договор №1.pdf",
    content: bytes.toString("base64"),
    key: key(),
  };
  const result = (await attachFile(sql, "staff_1", input, store)) as any;
  assert.equal(result.attachment.size, bytes.length);
  assert.equal(result.attachment.storage_key, undefined);
  assert.equal((await attachFile(sql, "staff_1", input, store)).replay, true);
  assert.deepEqual(await readFile(`${directory}/blob_file_1`), bytes);
  const listed = response();
  await listAttachments(
    request({ entity_type: "request", entity_id: "request_1" }),
    listed,
  );
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.attachments[0].storage_key, undefined);
  const res = response();
  await download(request({}, { id: "file_1" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, bytes);
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.ok(res.headers["content-disposition"].startsWith("attachment;"));
  await assert.rejects(
    attachFile(
      sql,
      "staff_1",
      {
        ...input,
        key: key(),
        content: Buffer.from("different").toString("base64"),
      },
      store,
    ),
    (e: any) => e.code === "FILE_ID_REUSED",
  );
  await removeAttachment(sql, "staff_1", { id: "file_1", key: key() });
  const removed = response();
  await download(request({}, { id: "file_1" }), removed);
  assert.equal(removed.statusCode, 404);
  assert.deepEqual(await readFile(`${directory}/blob_file_1`), bytes);
  assert.equal(
    (
      await db("woodright_desk_event")
        .where({ action: "attachment.removed" })
        .count("*")
        .first()
    )?.count,
    "1",
  );
});
test("unknown targets and oversized uploads never attach; filename/path/symlink escapes fail", async () => {
  const input = {
    id: "file_2",
    entityType: "person",
    entityId: "missing",
    filename: "Эскиз.dxf",
    content: "YWJj",
    key: key(),
  };
  await assert.rejects(
    attachFile(sql, "staff_1", input, store),
    (e: any) => e.status === 404,
  );
  assert.throws(
    () => decodeAttachment({ ...input, filename: "../../secret.pdf" }),
    (e: any) => e.code === "INVALID_FILENAME",
  );
  assert.throws(
    () =>
      decodeAttachment({
        ...input,
        content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64"),
      }),
    (e: any) => e.status === 413,
  );
  assert.equal(
    decodeAttachment({
      ...input,
      content: Buffer.alloc(MAX_ATTACHMENT_BYTES).toString("base64"),
    }).bytes.length,
    MAX_ATTACHMENT_BYTES,
  );
  await assert.rejects(
    new PrivateFileStore(`${process.cwd()}/static/private`).directory(),
    (e: any) => e.code === "PRIVATE_STORAGE_REQUIRED",
  );
  await symlink(directory, `${directory}-link`);
  try {
    await assert.rejects(
      new PrivateFileStore(`${directory}-link`).directory(),
      (e: any) => e.code === "UNSAFE_STORAGE",
    );
  } finally {
    await rm(`${directory}-link`);
  }
  await symlink("/etc/hosts", `${directory}/blob_escape`);
  await assert.rejects(store.get("blob_escape"));
  await assert.rejects(
    store.get("../escape"),
    (e: any) => e.code === "INVALID_ID",
  );
});
test("download rejects tampered bytes and anonymous/API-key actors cannot access documents", async () => {
  const bytes = Buffer.from("private");
  await attachFile(
    sql,
    "staff_1",
    {
      id: "file_integrity",
      entityType: "person",
      entityId: "person_1",
      filename: "ТЗ.txt",
      content: bytes.toString("base64"),
      key: key(),
    },
    store,
  );
  await db("woodright_private_attachment")
    .where({ id: "file_integrity" })
    .update({ sha256: createHash("sha256").update("changed").digest("hex") });
  const tampered = response();
  await download(request({}, { id: "file_integrity" }), tampered);
  assert.equal(tampered.statusCode, 503);
  assert.equal(tampered.body.code, "FILE_INTEGRITY");
  const anonymous = request();
  delete anonymous.auth_context;
  await assert.rejects(deskContext(anonymous), (e: any) => e.status === 401);
  const res = response();
  await download(anonymous, res);
  assert.equal(res.statusCode, 401);
  await assert.rejects(
    deskContext(request({}, {}, "api-key")),
    (e: any) => e.status === 401,
  );
  process.env.WOODRIGHT_DESK_FEATURES = "0";
  try {
    await assert.rejects(deskContext(request()), (e: any) => e.status === 503);
  } finally {
    process.env.WOODRIGHT_DESK_FEATURES = "1";
  }
});
test("migration refuses a non-test database", async () => {
  const otherUrl = new URL(databaseUrl);
  otherUrl.pathname = "/postgres";
  const other = knex({ client: "pg", connection: otherUrl.toString() });
  try {
    await assert.rejects(
      other.raw(DESK_SCHEMA),
      /isolated test database or the targeted production release/,
    );
    await assert.rejects(
      other.raw(MANGO_SCHEMA),
      /disposable workspace_it database/,
    );
  } finally {
    await other.destroy();
  }
});
test("MANGO duplicate, delayed and concurrent notifications persist once without rewinding a call", async () => {
  const credentials = { apiKey: "test-vpbx", signingKey: "test-signing-key" };
  const event = {
    call_id: "call:1",
    entry_id: "entry:1",
    seq: 2,
    timestamp: 1792500000,
    call_state: "Connected",
    location: "abonent",
    from: { number: "79000000001" },
    to: { extension: "101" },
  };
  const form = (data: object) => {
    const json = JSON.stringify(data);
    return {
      json,
      vpbx_api_key: credentials.apiKey,
      sign: mangoSignature(json, credentials),
    };
  };
  const results = await Promise.all([
    receiveMangoCall(sql, form(event), credentials),
    receiveMangoCall(sql, form(event), credentials),
  ]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  const delayed = await receiveMangoCall(
    sql,
    form({ ...event, seq: 1, call_state: "Appeared" }),
    credentials,
  );
  assert.equal(delayed.applied, false);
  assert.equal((await db("woodright_mango_call").first())?.state, "Connected");
  await receiveMangoCall(
    sql,
    form({ ...event, seq: 3, call_state: "Disconnected" }),
    credentials,
  );
  assert.equal(
    (await db("woodright_mango_call").first())?.state,
    "Disconnected",
  );
  assert.equal(
    (await db("woodright_mango_event").count("*").first())?.count,
    "3",
  );
  await assert.rejects(
    receiveMangoCall(
      sql,
      form({ ...event, call_state: "OnHold" }),
      credentials,
    ),
    (e: any) => e.code === "MANGO_EVENT_CONFLICT",
  );
  await assert.rejects(
    receiveMangoCall(
      sql,
      { ...form(event), sign: "0".repeat(64) },
      credentials,
    ),
    (e: any) => e.status === 401,
  );
  assert.equal(
    (await db("woodright_mango_event").count("*").first())?.count,
    "3",
  );
});

test("request creation with a new contact is atomic and lost-response retries create no duplicate", async () => {
  const input = {
    type: "request.create",
    id: "request_created",
    personId: "person_created",
    key: key(),
    person: {
      name: "Тестовый контакт",
      phone: "+7 999 000 11 22",
      email: "contact@example.test",
    },
    title: "Шкаф по размерам",
    description: "Обсудить наполнение",
    dimensions: "200 × 240",
    materials: "Дуб",
    budget: "Уточняется",
  };
  const first = await executeDeskCommand(sql, "staff_1", input);
  const retry = await executeDeskCommand(sql, "staff_1", input);
  assert.equal(retry.replay, true);
  assert.equal(first.bespoke_request.lead_id, "person_created");
  assert.equal(
    (await db("lead").where({ id: "person_created" }).first())?.source,
    "contact",
  );
  assert.equal(
    (
      await db("woodright_desk_event")
        .whereIn("entity_id", ["person_created", "request_created"])
        .count("*")
        .first()
    )?.count,
    "2",
  );
  const count = await db("lead").count("*").first();
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...input,
      key: key(),
      personId: "person_must_not_remain",
    }),
  );
  assert.deepEqual(await db("lead").count("*").first(), count);
});
test("creating a request requires an existing live client or valid new contact", async () => {
  const base = {
    type: "request.create",
    id: "bad_request",
    personId: "missing_person",
    key: key(),
    title: "Запрос",
  };
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", base),
    (e: any) => e.code === "ENTITY_NOT_FOUND",
  );
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      person: { name: "", email: "bad" },
    }),
    (e: any) => e.code === "INVALID_TEXT",
  );
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      person: { name: "Имя", email: "bad" },
    }),
    (e: any) => e.code === "INVALID_EMAIL",
  );
  assert.equal(
    await db("bespoke_request").where({ id: "bad_request" }).first(),
    undefined,
  );
  const created = await executeDeskCommand(sql, "staff_1", {
    ...base,
    key: key(),
    personId: "person_created",
  });
  assert.equal(created.bespoke_request.status, "new");
});
test("contact edits preserve source, record history, and refuse stale writers", async () => {
  const current = (await db("lead").where({ id: "person_created" }).first())!;
  const command = {
    type: "person.update",
    id: "person_created",
    key: key(),
    expectedUpdatedAt: current.updated_at.toISOString(),
    person: {
      name: "Обновлённый контакт",
      phone: "+7 999 000 11 22",
      email: "updated@example.test",
      comment: "Уточнить время",
    },
  };
  await executeDeskCommand(sql, "staff_1", command);
  await assert.rejects(
    executeDeskCommand(sql, "staff_2", { ...command, key: key() }),
    (e: any) => e.code === "STALE_VERSION",
  );
  assert.equal(
    (await db("lead").where({ id: "person_created" }).first())?.source,
    "contact",
  );
  const result = response();
  await listHistory(
    request({ entity_type: "person", entity_id: "person_created" }),
    result,
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.events[0].action, "person.updated");
  assert.ok(!JSON.stringify(result.body).includes("updated@example.test"));
  const denied = response();
  await listHistory(
    request(
      { entity_type: "person", entity_id: "person_created" },
      {},
      "customer",
    ),
    denied,
  );
  assert.equal(denied.statusCode, 401);
});
test("global document index is staff-only and never exposes blob keys or removed files", async () => {
  const result = response();
  await listFiles(request({ limit: 1, offset: 0 }), result);
  assert.equal(result.statusCode, 200);
  assert.ok(Number.isInteger(result.body.count));
  assert.ok(!JSON.stringify(result.body).includes("storage_key"));
  assert.ok(!result.body.attachments.some((r: any) => r.id === "file_1"));
  const denied = response();
  await listFiles(request({}, {}, "api-key"), denied);
  assert.equal(denied.statusCode, 401);
});

const companyInput = {
  name: "Служебная студия",
  legalName: "",
  taxId: "",
  kpp: "",
  email: "studio@example.test",
  phone: "",
  address: "",
  notes: "",
  status: "active",
};
test("companies persist, replay and concurrent changes use one version without losing history", async () => {
  const c = {
    type: "company.create",
    id: "company_1",
    company: companyInput,
    key: key(),
  };
  const first = await executeDeskCommand(sql, "staff_1", c);
  assert.equal(first.company.version, 1);
  assert.equal((await executeDeskCommand(sql, "staff_1", c)).replay, true);
  const result = await Promise.allSettled(
    ["Первый текст", "Второй текст"].map((notes) =>
      executeDeskCommand(sql, "staff_1", {
        type: "company.update",
        id: c.id,
        company: { ...companyInput, notes },
        expectedVersion: 1,
        key: key(),
      }),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "STALE_VERSION",
  );
  assert.equal(
    (await db("woodright_company").where({ id: c.id }).first()).version,
    2,
  );
});
test("assignment validates active staff and companies, locks first assignment, and preserves archived links", async () => {
  const base = {
    type: "record.update",
    id: "request_1",
    entityType: "request",
    ownership: { companyId: "company_1", assigneeId: "staff_2" },
    expectedVersion: 0,
    key: key(),
  };
  const concurrent = await Promise.allSettled([
    executeDeskCommand(sql, "staff_1", base),
    executeDeskCommand(sql, "staff_2", {
      ...base,
      key: key(),
      ownership: { ...base.ownership, assigneeId: "staff_1" },
    }),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (concurrent.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "STALE_VERSION",
  );
  const row = await db("woodright_desk_record")
    .where({ entity_id: "request_1" })
    .first();
  assert.equal(row.version, 1);
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      key: key(),
      expectedVersion: 1,
      ownership: { companyId: "company_1", assigneeId: "staff_deleted" },
    }),
    (e: any) => e.code === "INVALID_ASSIGNEE",
  );
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      key: key(),
      id: "missing_request",
    }),
    (e: any) => e.status === 404,
  );
  await executeDeskCommand(sql, "staff_1", {
    type: "company.update",
    id: "company_1",
    company: { ...companyInput, status: "archived" },
    expectedVersion: 2,
    key: key(),
  });
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      key: key(),
      entityType: "person",
      id: "person_1",
    }),
    (e: any) => e.code === "COMPANY_UNAVAILABLE",
  );
  const retained = await executeDeskCommand(sql, "staff_1", {
    ...base,
    key: key(),
    expectedVersion: 1,
  });
  assert.equal(retained.record.company_id, "company_1");
  await executeDeskCommand(sql, "staff_1", {
    type: "company.update",
    id: "company_1",
    company: companyInput,
    expectedVersion: 3,
    key: key(),
  });
  const active = response();
  await listStaff(request(), active);
  assert.equal(active.body.staff.length, 2);
  assert.ok(
    active.body.staff.every(
      (s: any) =>
        Object.keys(s).sort().join(",") ===
        "access,email,first_name,id,last_name",
    ),
  );
});
test("new records and their assignments are atomic; reminders can be assigned without stale completion", async () => {
  const base = {
    type: "person.create",
    id: "owned_person",
    person: { name: "Контакт студии" },
    ownership: { companyId: "company_1", assigneeId: "staff_2" },
    key: key(),
  };
  await assert.rejects(
    executeDeskCommand(sql, "staff_1", {
      ...base,
      ownership: { ...base.ownership, assigneeId: "missing_staff" },
    }),
  );
  assert.equal(await db("lead").where({ id: base.id }).first(), undefined);
  await executeDeskCommand(sql, "staff_1", base);
  assert.equal(
    (await db("woodright_desk_record").where({ entity_id: base.id }).first())
      .assignee_id,
    "staff_2",
  );
  const r = await executeDeskCommand(sql, "staff_1", {
    type: "reminder.create",
    id: "team_reminder",
    entityType: "company",
    entityId: "company_1",
    summary: "Согласовать состав",
    dueOn: "2026-10-22",
    assigneeId: "staff_2",
    key: key(),
  });
  assert.equal(r.reminder.assignee_id, "staff_2");
  await executeDeskCommand(sql, "staff_1", {
    type: "reminder.update",
    id: "team_reminder",
    status: "open",
    expectedVersion: 1,
    assigneeId: "staff_1",
    key: key(),
  });
  await assert.rejects(
    executeDeskCommand(sql, "staff_2", {
      type: "reminder.update",
      id: "team_reminder",
      status: "done",
      expectedVersion: 1,
      key: key(),
    }),
    (e: any) => e.status === 409,
  );
  const file = await attachFile(
    sql,
    "staff_1",
    {
      id: "company_file",
      entityType: "company",
      entityId: "company_1",
      filename: "Схема.txt",
      content: "YWJj",
      key: key(),
    },
    store,
  );
  assert.equal(file.attachment.entity_type, "company");
});
