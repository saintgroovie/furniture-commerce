"use strict"

const ALLOWED_MIGRATION = "Migration20260908120000"

function buildUpOptions(name) {
  if (name !== ALLOWED_MIGRATION) {
    const error = new Error("REFUSED_MIGRATION " + String(name))
    error.code = "REFUSED_MIGRATION"
    throw error
  }
  return { migrations: [ALLOWED_MIGRATION] }
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

async function runFramework(name, migrationsDir, databaseUrl) {
  const options = buildUpOptions(name)
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
  try {
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
    const result = process.env.WOODRIGHT_TARGETED_MIGRATION_DIRECTION === "down"
      ? await migrations.revert(options)
      : await migrations.run(options)
    const names = (result || []).map((row) => row.name)
    if (names.length !== 1 || names[0] !== ALLOWED_MIGRATION || seen.some((item) => item !== ALLOWED_MIGRATION)) {
      throw new Error("UNEXPECTED_RESULT " + names.join(","))
    }
    return names
  } finally {
    // Migrations.run/revert already close the connection. Close again so a
    // failure before that still releases the pool and the process can exit.
    try {
      if (orm && typeof orm.close === "function") {
        await orm.close(true)
      }
    } catch (_error) {
      // Already closed by the framework wrapper.
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const name = args.migration
  const options = buildUpOptions(name)
  if (process.env.WOODRIGHT_TARGETED_MIGRATION_FRAMEWORK !== "1") {
    process.stdout.write(JSON.stringify({ mode: "plan", options }) + "\n")
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

module.exports = { ALLOWED_MIGRATION, buildUpOptions }

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(String(error && error.message ? error.message : error) + "\n")
    process.exit(1)
  })
}
