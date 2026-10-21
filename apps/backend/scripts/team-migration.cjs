"use strict";
const path = require("node:path");
const MIGRATION = "Migration20261021120000";
const RELEASE = "desk-team-v1-20261021";
const TABLES = [
  "woodright_company",
  "woodright_desk_record",
];
function validateTarget(url, source, env = process.env) {
  const u = new URL(url);
  const database = decodeURIComponent(u.pathname.slice(1));
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
    throw new Error("REFUSED_DESK_MIGRATION_TARGET");
  return database;
}
async function run({ source, apply }) {
  const directory = path.resolve(__dirname, "../src/modules/crm/migrations");
  const compiled = require("node:fs").existsSync(
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
    const actual = await connection.execute(
      "select current_database() as name",
    );
    if (actual[0]?.name !== database)
      throw new Error("DATABASE_IDENTITY_CHANGED");
    const existing = await connection.execute(
      "select to_regclass('public.mikro_orm_migrations') as migrations",
    );
    const applied = existing[0]?.migrations
      ? await connection.execute(
          "select name from mikro_orm_migrations where name = ?",
          [MIGRATION],
        )
      : [];
    const names = await connection.execute(
      "select tablename from pg_tables where schemaname='public' and tablename in (?, ?)",
      TABLES,
    );
    if (applied.length) {
      if (names.length !== TABLES.length)
        throw new Error("DESK_BOOKKEEPING_WITHOUT_SCHEMA");
      return { mode: "already_applied", migrations: [MIGRATION], database };
    }
    if (names.length) throw new Error("DESK_PARTIAL_SCHEMA_REQUIRES_REVIEW");
    // Only one CRM migration. In particular this never calls the global Medusa db:migrate command.
    const migrations = new Migrations(orm);
    const seen = [];
    migrations.on("migrating", (event) => {
      if (event.name !== MIGRATION)
        throw new Error("UNEXPECTED_DESK_MIGRATION");
      seen.push(event.name);
    });
    const result = await migrations.run({ migrations: [MIGRATION] });
    if (
      seen.length !== 1 ||
      result.length !== 1 ||
      result[0].name !== MIGRATION
    )
      throw new Error("DESK_MIGRATION_RESULT_UNCONFIRMED");
    return { mode: "applied", migrations: [MIGRATION], database };
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
    .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch((e) => {
      // Never emit connection configuration, a stack containing SQL data, or the DSN.
      process.stderr.write(
        "DESK_MIGRATION_FAILED " +
          (/^[A-Z_]+$/.test(e.message)
            ? e.message
            : "CHECK_TARGETED_MIGRATION") +
          "\n",
      );
      process.exitCode = 1;
    });
}
