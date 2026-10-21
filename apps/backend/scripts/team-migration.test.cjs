"use strict";
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateTarget, RELEASE, MIGRATION } = require("./team-migration.cjs");
const raw = process.env.WOODRIGHT_DESK_TEST_DATABASE_URL;
const url = new URL(raw);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/workspace_it[a-zA-Z0-9_]*$/.test(url.pathname)
)
  throw new Error(
    "targeted tests require a local disposable workspace_it database",
  );
const made = [];
async function query(database, sql) {
  const target = new URL(url);
  target.pathname = "/" + database;
  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}
async function create(database) {
  await query(url.pathname.slice(1), `create database "${database}"`);
  made.push(database);
}
after(async () => {
  for (const name of made)
    await query(url.pathname.slice(1), `drop database "${name}"`);
});
function execute(database, extra = {}) {
  const connection = new URL(url);
  connection.pathname = "/" + database;
  return spawnSync(
    process.execPath,
    [
      path.join(__dirname, "team-migration.cjs"),
      "--apply",
      "--source",
      "a".repeat(40),
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: connection.toString(),
        WOODRIGHT_RUNTIME_ROLE: "public_production",
        WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db",
        WOODRIGHT_BACKEND_SOURCE_SHA: "a".repeat(40),
        WOODRIGHT_DESK_SCHEMA_RELEASE: RELEASE,
        ...extra,
      },
      encoding: "utf8",
      timeout: 30000,
    },
  );
}
test("production-target gates reject missing authorization and changed identity", () => {
  const production = new URL(url);
  production.pathname = "/woodright_public_production";
  assert.throws(
    () => validateTarget(production.toString(), "a".repeat(40), {}),
    /REFUSED/,
  );
  const env = {
    WOODRIGHT_RUNTIME_ROLE: "public_production",
    WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db",
    WOODRIGHT_BACKEND_SOURCE_SHA: "a".repeat(40),
    WOODRIGHT_DESK_SCHEMA_RELEASE: RELEASE,
  };
  assert.equal(
    validateTarget(production.toString(), "a".repeat(40), env),
    "woodright_public_production",
  );
  assert.throws(
    () => validateTarget(production.toString(), "b".repeat(40), env),
    /REFUSED/,
  );
});
test("targeted framework migrates only the desk; repeated apply is a no-op", async () => {
  const db = "workspace_it_targeted_team";
  await create(db);
  const first = execute(db);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout.trim()).mode, "applied");
  assert.deepEqual(
    (await query(db, "select name from mikro_orm_migrations")).rows.map(
      (r) => r.name,
    ),
    [MIGRATION],
  );
  assert.equal(
    (await query(db, "select to_regclass('woodright_mango_call') as mango"))
      .rows[0].mango,
    null,
  );
  const retry = execute(db);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout.trim()).mode, "already_applied");
});
test("production-named isolated rehearsal refuses a generic run and accepts only the targeted release", async () => {
  // This database exists only inside the disposable localhost PostgreSQL service.
  const db = "woodright_public_production";
  await create(db);
  const { TEAM_SCHEMA: DESK_SCHEMA } = require("../dist/src/lib/woodright-desk/team-schema.js");
  await assert.rejects(query(db, DESK_SCHEMA), /targeted production release/);
  const refused = execute(db, { WOODRIGHT_DESK_SCHEMA_RELEASE: "" });
  assert.equal(refused.status, 1);
  assert.equal(
    (await query(db, "select to_regclass('woodright_company') as desk"))
      .rows[0].desk,
    null,
  );
  const approved = execute(db);
  assert.equal(approved.status, 0, approved.stderr);
  assert.deepEqual(
    (await query(db, "select name from mikro_orm_migrations")).rows.map(
      (r) => r.name,
    ),
    [MIGRATION],
  );
});
