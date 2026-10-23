const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  MIGRATION,
  RELEASE,
  validateTarget,
  run,
} = require("./invoice-migration.cjs");
test("invoice runner refuses generic production writes and pins one exact migration", async () => {
  const source = "a".repeat(40),
    url = "postgres://localhost/woodright_public_production";
  assert.throws(() => validateTarget(url, source, {}));
  const env = {
    WOODRIGHT_RUNTIME_ROLE: "public_production",
    WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db",
    WOODRIGHT_DESK_SCHEMA_RELEASE: RELEASE,
    WOODRIGHT_BACKEND_SOURCE_SHA: source,
  };
  assert.equal(validateTarget(url, source, env), "woodright_public_production");
  assert.throws(() => validateTarget(url, "b".repeat(40), env));
  assert.throws(() =>
    validateTarget("postgres://localhost/production_other", source, env),
  );
  const plan = await run({ apply: false });
  assert.deepEqual(plan.migrations, [MIGRATION]);
  assert.deepEqual(plan.tables, ["woodright_invoice"]);
});

const databaseUrl = process.env.WOODRIGHT_DESK_TEST_DATABASE_URL;
if (databaseUrl) {
  const { Client } = require("pg");
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const { after } = require("node:test");
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^\/workspace_it[\w]*$/.test(url.pathname)
  )
    throw Error("DISPOSABLE_INVOICE_REHEARSAL_REQUIRED");
  const made = [];
  async function query(database, text) {
    const target = new URL(url);
    target.pathname = "/" + database;
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    try {
      return await client.query(text);
    } finally {
      await client.end();
    }
  }
  function execute(database, script = "invoice-migration.cjs") {
    const target = new URL(url);
    target.pathname = "/" + database;
    return spawnSync(
      process.execPath,
      [path.join(__dirname, script), "--apply", "--source", "a".repeat(40)],
      {
        env: { ...process.env, DATABASE_URL: target.toString() },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  }
  async function fixture(database) {
    await query(url.pathname.slice(1), `create database "${database}"`);
    made.push(database);
    for (const script of ["desk-migration.cjs", "team-migration.cjs"]) {
      const result = execute(database, script);
      assert.equal(result.status, 0, result.stderr);
    }
  }
  after(async () => {
    for (const db of made)
      await query(url.pathname.slice(1), `drop database "${db}"`);
  });
  test("targeted invoice rehearsal changes only the approved table/column and repeats without writes", async () => {
    const db = "workspace_it_invoice_migration";
    await fixture(db);
    const before = (
      await query(db, "select name from mikro_orm_migrations order by name")
    ).rows.map((r) => r.name);
    const first = execute(db);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout.trim()).mode, "applied");
    assert.deepEqual(
      (
        await query(db, "select name from mikro_orm_migrations order by name")
      ).rows.map((r) => r.name),
      [...before, MIGRATION].sort(),
    );
    const table = (
      await query(
        db,
        "select to_regclass('woodright_invoice') as invoice, to_regclass('woodright_mango_call') as mango",
      )
    ).rows[0];
    assert.equal(table.invoice, "woodright_invoice");
    assert.equal(table.mango, null);
    const repeat = execute(db);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.equal(JSON.parse(repeat.stdout.trim()).mode, "already_applied");
  });
  test("partial invoice schema refuses apply without changing its migration ledger", async () => {
    const db = "workspace_it_invoice_partial";
    await fixture(db);
    await query(
      db,
      "alter table woodright_private_attachment add column visibility text",
    );
    const before = (
      await query(db, "select name from mikro_orm_migrations order by name")
    ).rows;
    const result = execute(db);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /INVOICE_PARTIAL_SCHEMA_REQUIRES_REVIEW/);
    assert.deepEqual(
      (await query(db, "select name from mikro_orm_migrations order by name"))
        .rows,
      before,
    );
  });
}
