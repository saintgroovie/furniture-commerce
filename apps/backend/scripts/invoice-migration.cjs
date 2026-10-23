"use strict";
const path = require("node:path");
const MIGRATION = "Migration20261023120000",
  RELEASE = "desk-invoice-v1-20261023",
  TABLES = ["woodright_invoice"];
function validateTarget(url, source, env = process.env) {
  const u = new URL(url),
    database = decodeURIComponent(u.pathname.slice(1));
  if (
    /^workspace_it[a-zA-Z0-9_]*$/.test(database) &&
    ["127.0.0.1", "localhost"].includes(u.hostname)
  )
    return database;
  if (
    database !== "woodright_public_production" ||
    env.WOODRIGHT_RUNTIME_ROLE !== "public_production" ||
    env.WOODRIGHT_DATABASE_IDENTITY_ALIAS !== "public_production_db" ||
    env.WOODRIGHT_DESK_SCHEMA_RELEASE !== RELEASE ||
    !/^[a-f0-9]{40}$/.test(source || "") ||
    env.WOODRIGHT_BACKEND_SOURCE_SHA !== source
  )
    throw Error("REFUSED_INVOICE_MIGRATION_TARGET");
  return database;
}
async function run({ source, apply }) {
  const directory = path.resolve(__dirname, "../src/modules/crm/migrations"),
    compiled = require("node:fs").existsSync(
      path.join(directory, MIGRATION + ".js"),
    );
  const migrationsDir = compiled
    ? directory
    : path.resolve(__dirname, "../dist/src/modules/crm/migrations");
  if (!apply)
    return {
      mode: "plan",
      migrations: [MIGRATION],
      migrationsDir,
      tables: TABLES,
      altered_columns: ["woodright_private_attachment.visibility"],
    };
  const database = validateTarget(process.env.DATABASE_URL, source);
  const { mikroOrmCreateConnection } = require(
    path.resolve(
      __dirname,
      "../node_modules/@medusajs/utils/dist/dal/mikro-orm/mikro-orm-create-connection.js",
    ),
  );
  const { Migrations } = require(
    path.resolve(
      __dirname,
      "../node_modules/@medusajs/utils/dist/migrations/index.js",
    ),
  );
  const orm = await mikroOrmCreateConnection(
    {
      clientUrl: process.env.DATABASE_URL,
      schema: "public",
      debug: false,
      snapshot: false,
      driverOptions: {
        connection: {
          ssl: false,
          options: `-c woodright.desk_schema_release=${RELEASE}`,
        },
      },
    },
    [],
    migrationsDir,
  );
  try {
    const connection = orm.em.getConnection();
    if (
      (await connection.execute("select current_database() as name"))[0]
        ?.name !== database
    )
      throw Error("DATABASE_IDENTITY_CHANGED");
    const prerequisites = (
      await connection.execute(
        "select to_regclass('woodright_company') as company,to_regclass('woodright_private_attachment') as attachment,to_regclass('woodright_desk_operation') as operation",
      )
    )[0];
    if (
      !prerequisites?.company ||
      !prerequisites?.attachment ||
      !prerequisites?.operation
    )
      throw Error("DESK_SCHEMA_REQUIRED");
    const before = (
      await connection.execute(
        "select name from mikro_orm_migrations order by name",
      )
    ).map((r) => r.name);
    const table = (
      await connection.execute(
        "select to_regclass('woodright_invoice') as invoice",
      )
    )[0]?.invoice;
    const column =
      (
        await connection.execute(
          "select column_name from information_schema.columns where table_schema='public' and table_name='woodright_private_attachment' and column_name='visibility'",
        )
      ).length > 0;
    if (before.includes(MIGRATION)) {
      if (!table || !column) throw Error("INVOICE_LEDGER_WITHOUT_SCHEMA");
      return { mode: "already_applied", migrations: [MIGRATION], database };
    }
    if (table || column) throw Error("INVOICE_PARTIAL_SCHEMA_REQUIRES_REVIEW");
    const migrations = new Migrations(orm),
      seen = [];
    migrations.on("migrating", (event) => {
      if (event.name !== MIGRATION) throw Error("UNEXPECTED_INVOICE_MIGRATION");
      seen.push(event.name);
    });
    const result = await migrations.run({ migrations: [MIGRATION] });
    // Medusa's migration wrapper closes its ORM even on success.
    await orm.connect();
    const after = (
      await connection.execute(
        "select name from mikro_orm_migrations order by name",
      )
    ).map((r) => r.name);
    if (
      seen.length !== 1 ||
      result.length !== 1 ||
      result[0].name !== MIGRATION ||
      JSON.stringify(after) !== JSON.stringify([...before, MIGRATION].sort())
    )
      throw Error("INVOICE_MIGRATION_RESULT_UNCONFIRMED");
    return {
      mode: "applied",
      migrations: [MIGRATION],
      database,
      unrelated_migrations_unchanged: true,
    };
  } finally {
    try {
      await orm.close(true);
    } catch (e) {
      if (
        !/already closed|connection closed|connection is closed|driver is closed/i.test(
          String(e.message),
        )
      )
        throw e;
    }
  }
}
module.exports = { MIGRATION, RELEASE, TABLES, validateTarget, run };
if (require.main === module) {
  const args = require("node:util").parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      source: { type: "string" },
    },
  }).values;
  run(args)
    .then((r) => process.stdout.write(JSON.stringify(r) + "\n"))
    .catch((e) => {
      process.stderr.write(
        "INVOICE_MIGRATION_FAILED " +
          (/^[A-Z_]+$/.test(e.message)
            ? e.message
            : "CHECK_TARGETED_MIGRATION") +
          "\n",
      );
      process.exitCode = 1;
    });
}
