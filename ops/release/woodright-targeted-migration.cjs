"use strict"

const ALLOWED_MIGRATION = "Migration20260908120000"
const ALLOWED_MIGRATIONS_DIR = "/server/src/modules/promotion-slot/migrations"

function buildUpOptions(name) {
  if (name !== ALLOWED_MIGRATION) {
    const error = new Error("REFUSED_MIGRATION " + String(name))
    error.code = "REFUSED_MIGRATION"
    throw error
  }
  return { migrations: [ALLOWED_MIGRATION] }
}

function assertMigrationsDir(dir) {
  if (dir !== ALLOWED_MIGRATIONS_DIR) {
    const error = new Error("REFUSED_MIGRATIONS_DIR")
    error.code = "REFUSED_MIGRATIONS_DIR"
    throw error
  }
  return ALLOWED_MIGRATIONS_DIR
}

function assertMigrationResult(names, seen) {
  const executed = Array.isArray(names) ? names : []
  const events = Array.isArray(seen) ? seen : []
  if (executed.length !== 1 || executed[0] !== ALLOWED_MIGRATION) {
    throw new Error("UNEXPECTED_RESULT " + executed.join(","))
  }
  if (events.length === 0 || events.some((item) => item !== ALLOWED_MIGRATION)) {
    throw new Error("UNEXPECTED_MIGRATION " + events.join(","))
  }
  return executed
}

function isBenignCloseError(error) {
  const message = String(error && error.message ? error.message : error).toLowerCase()
  return (
    message.includes("already closed") ||
    message.includes("connection closed") ||
    message.includes("connection is closed") ||
    message.includes("driver is closed")
  )
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) {
      throw new Error("unexpected argument " + token)
    }
    const key = token.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith("--")) {
      throw new Error("missing value for --" + key)
    }
    out[key] = value
    i++
  }
  return out
}

async function closeOrm(orm) {
  if (!orm || typeof orm.close !== "function") return null
  try {
    await orm.close(true)
    return null
  } catch (error) {
    if (isBenignCloseError(error)) return null
    process.stderr.write(
      "ORM_CLOSE_ERROR " + redact(error && error.message ? error.message : error) + "\n"
    )
    return error
  }
}

function assertCloseOutcome(closeError, migrationError) {
  if (migrationError) throw migrationError
  if (closeError) {
    const message = redact(closeError && closeError.message ? closeError.message : closeError)
    throw new Error("ORM_CLOSE_FAILED " + message)
  }
}

function redact(message) {
  return String(message).replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgres://redacted@")
}

async function runFramework(name, migrationsDir, databaseUrl) {
  const options = buildUpOptions(name)
  assertMigrationsDir(migrationsDir)
  const { mikroOrmCreateConnection } = require("/server/node_modules/@medusajs/utils/dist/dal/mikro-orm/mikro-orm-create-connection.js")
  const { Migrations } = require("/server/node_modules/@medusajs/utils/dist/migrations/index.js")
  const orm = await mikroOrmCreateConnection(
    {
      clientUrl: databaseUrl,
      schema: "public",
      driverOptions: { connection: { ssl: false } },
      debug: false,
      snapshot: false,
    },
    [],
    migrationsDir
  )
  const migrations = new Migrations(orm)
  const seen = []
  const guard = (event) => {
    seen.push(event.name)
    if (event.name !== ALLOWED_MIGRATION) {
      throw new Error("UNEXPECTED_MIGRATION " + event.name)
    }
  }
  migrations.on("migrating", guard)
  migrations.on("reverting", guard)
  let names
  try {
    const result = await migrations.run(options)
    names = assertMigrationResult((result || []).map((row) => row.name), seen)
  } catch (error) {
    await closeOrm(orm)
    throw error
  }
  assertCloseOutcome(await closeOrm(orm), null)
  return names
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const name = args.migration
  const options = buildUpOptions(name)
  if (process.env.WOODRIGHT_TARGETED_MIGRATION_FRAMEWORK !== "1") {
    process.stdout.write(JSON.stringify({ mode: "plan", options, migrationsDir: ALLOWED_MIGRATIONS_DIR }) + "\n")
    return
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL required")
  }
  if (!args["migrations-dir"]) {
    throw new Error("migrations-dir required")
  }
  const names = await runFramework(name, args["migrations-dir"], process.env.DATABASE_URL)
  process.stdout.write(JSON.stringify({ mode: "executed", names }) + "\n")
}

module.exports = {
  ALLOWED_MIGRATION,
  ALLOWED_MIGRATIONS_DIR,
  buildUpOptions,
  assertMigrationsDir,
  assertMigrationResult,
  isBenignCloseError,
  assertCloseOutcome,
  redact,
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(redact(error && error.message ? error.message : error) + "\n")
    process.exit(1)
  })
}
