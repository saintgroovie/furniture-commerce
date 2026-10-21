// Isolated native-auth boundary rehearsal. Credentials are random, memory-only, and never production defaults.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { spawn } from "node:child_process";

const password = randomBytes(4).toString("hex");
const revision = randomBytes(20).toString("hex");
let authCalls = 0;
const native = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.setHeader("x-woodright-runtime-role", "non_public_candidate");
    response.setHeader(
      "x-woodright-database-identity",
      "non_public_candidate_db",
    );
    response.setHeader("x-woodright-backend-source-sha", revision);
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.url === "/auth/user/emailpass" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    authCalls++;
    if (
      body.password === password &&
      ["staff@example.test", "unregistered@example.test"].includes(body.email)
    ) {
      response.end(
        JSON.stringify({
          token:
            body.email === "staff@example.test"
              ? "isolated-staff-token"
              : "isolated-unregistered-token",
        }),
      );
      return;
    }
  }
  if (
    request.url === "/admin/users/me" &&
    request.headers.authorization === "Bearer isolated-staff-token"
  ) {
    response.end(
      JSON.stringify({
        user: { id: "user_isolated", email: "staff@example.test" },
      }),
    );
    return;
  }
  response.statusCode = 401;
  response.end(JSON.stringify({ message: "Unauthorized" }));
});
await new Promise((resolve) => native.listen(0, "127.0.0.1", resolve));
const backend = `http://127.0.0.1:${native.address().port}`;
const probe = createProbe();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const basePath = process.env.NEXT_PUBLIC_WORKSPACE_BASE_PATH || "";
const base = origin + basePath;
const child = spawn(process.execPath, ["scripts/start-live.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    WOODRIGHT_WORKSPACE_RUNTIME: "hosted",
    WOODRIGHT_WORKSPACE_ORIGIN: origin,
    WOODRIGHT_WORKSPACE_SESSION_SECRET: randomBytes(48).toString("base64url"),
    MEDUSA_BACKEND_INTERNAL_URL: backend,
    WOODRIGHT_DATA_ENVIRONMENT: "non_public_candidate",
    WOODRIGHT_EXPECTED_DATABASE_IDENTITY: "non_public_candidate_db",
    WOODRIGHT_EXPECTED_BACKEND_REVISION: revision,
    WOODRIGHT_LIVE_WRITES: "0",
  },
  stdio: "ignore",
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (
        (
          await fetch(base + "/api/live/status", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    ready,
    true,
    "compiled hosted workspace must verify its isolated backend",
  );
  const login = (email, entered) =>
    fetch(base + "/api/live/session", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password: entered }),
    });
  const accepted = await login("staff@example.test", password);
  assert.equal(
    accepted.status,
    200,
    "existing credentials must reach native staff authentication regardless of new-password length policy",
  );
  const cookie = accepted.headers.get("set-cookie");
  assert.ok(cookie.startsWith(basePath ? "wr_os=" : "wr_desk="));
  for (const flag of [/Secure/i, /HttpOnly/i, /SameSite=strict/i])
    assert.match(cookie, flag);
  const session = await fetch(base + "/api/live/session", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).email, "staff@example.test");
  assert.equal(
    (await login("staff@example.test", password + "-wrong")).status,
    401,
  );
  const unregistered = await login("unregistered@example.test", password);
  assert.equal(
    unregistered.status,
    401,
    "a registered auth identity without a staff actor must not gain access",
  );
  assert.equal(unregistered.headers.get("set-cookie"), null);
  assert.equal(authCalls, 3);
  console.log(
    "Hosted native login passed: existing credentials accepted, wrong credentials and non-staff refused, secure signed staff session retained.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000).unref();
  });
  await new Promise((resolve) => native.close(resolve));
}
