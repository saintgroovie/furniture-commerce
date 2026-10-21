import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, open, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import pg from "pg";
import { verifyEmployeeFlow } from "../../workspace/scripts/qa-employee-flow.mjs";
const database = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !/^\/workspace_it[\w]*$/.test(database.pathname)
)
  throw Error("Disposable local employee-flow database required");
const backendRoot = process.cwd(),
  workspaceRoot = resolve(backendRoot, "../workspace"),
  directory = await mkdtemp(
    resolve(await realpath(tmpdir()), "woodright-employee-flow-"),
  );
const env = {
  ...process.env,
  NODE_ENV: "development",
  XDG_CONFIG_HOME: directory,
  MEDUSA_DISABLE_TELEMETRY: "1",
  WOODRIGHT_DESK_FEATURES: "1",
  WOODRIGHT_PRIVATE_FILES_ROOT: resolve(directory, "private-files"),
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_DATABASE_IDENTITY: "non_public_candidate_db",
  WOODRIGHT_BACKEND_SOURCE_SHA: "a".repeat(40),
  WOODRIGHT_EXPOSURE: "private",
};
const children = [];
await mkdir(env.WOODRIGHT_PRIVATE_FILES_ROOT, { mode: 0o700 });
async function launch(args, cwd, environment, name) {
  const log = await open(resolve(directory, name + ".log"), "w", 0o600);
  const child = spawn(process.execPath, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
  });
  await log.close();
  children.push(child);
  return child;
}
async function port() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
}
async function ready(url) {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("QA service did not start: " + url + "; logs: " + directory);
}
try {
  const fixtures = await launch(
    ["scripts/desk-test-fixtures.mjs"],
    backendRoot,
    { ...env, WOODRIGHT_DESK_TEST_DATABASE_URL: database.toString() },
    "fixtures",
  );
  if ((await new Promise((resolve) => fixtures.once("exit", resolve))) !== 0)
    throw Error("Isolated CRM fixtures failed; inspect " + directory);
  const email = `qa-owner-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("base64url");
  const user = await launch(
    ["node_modules/@medusajs/cli/cli.js", "user", "-e", email, "-p", password],
    backendRoot,
    env,
    "bootstrap",
  );
  const code = await new Promise((r) => user.once("exit", r));
  if (code !== 0)
    throw Error("Native test user bootstrap failed; inspect " + directory);
  const db = new pg.Client({ connectionString: database.toString() });
  await db.connect();
  try {
    await db.query('update "user" set metadata=$1::jsonb where email=$2', [
      JSON.stringify({
        woodright_access: { role: "god", version: 1, enabled: true },
      }),
      email,
    ]);
  } finally {
    await db.end();
  }
  const backendPort =
      Number(process.env.WOODRIGHT_EMPLOYEE_FLOW_BACKEND_PORT) ||
      (await port()),
    workspacePort =
      Number(process.env.WOODRIGHT_EMPLOYEE_FLOW_WORKSPACE_PORT) ||
      (await port());
  const backend = `http://127.0.0.1:${backendPort}`,
    origin = `http://127.0.0.1:${workspacePort}`;
  await launch(
    [
      "node_modules/@medusajs/cli/cli.js",
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(backendPort),
    ],
    backendRoot,
    env,
    "backend",
  );
  await ready(backend + "/health");
  await launch(
    ["scripts/start-live.mjs"],
    workspaceRoot,
    {
      ...env,
      PORT: String(workspacePort),
      WOODRIGHT_WORKSPACE_RUNTIME: "local-private",
      NEXT_PUBLIC_WORKSPACE_BASE_PATH: "/os",
      WOODRIGHT_WORKSPACE_ORIGIN: origin,
      MEDUSA_BACKEND_INTERNAL_URL: backend,
      WOODRIGHT_DATA_ENVIRONMENT: "non_public_candidate",
      WOODRIGHT_EXPECTED_DATABASE_IDENTITY: "non_public_candidate_db",
      WOODRIGHT_EXPECTED_BACKEND_REVISION: env.WOODRIGHT_BACKEND_SOURCE_SHA,
      WOODRIGHT_LIVE_WRITES: "1",
    },
    "workspace",
  );
  await ready(origin + "/os/api/live/status");
  const report = await verifyEmployeeFlow({
    base: origin + "/os",
    backend,
    ownerEmail: email,
    ownerPassword: password,
    expectedEnvironment: "non_public_candidate",
    reportPath:
      process.env.WOODRIGHT_EMPLOYEE_FLOW_REPORT ||
      resolve(directory, "report.json"),
    uiFile: process.env.WOODRIGHT_EMPLOYEE_FLOW_UI_SESSION_FILE,
  });
  console.log(
    "ISOLATED_EMPLOYEE_FLOW_PASS",
    JSON.stringify({
      directory,
      checks: report.checks.length,
      cleanup: report.cleanup,
    }),
  );
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      await new Promise((r) => {
        child.once("exit", r);
        setTimeout(() => {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
          r();
        }, 5000).unref();
      });
    }
  }
}
