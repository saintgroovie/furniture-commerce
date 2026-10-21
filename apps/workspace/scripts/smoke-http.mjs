import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port),
  WOODRIGHT_WORKSPACE_RUNTIME: "local-private",
  WOODRIGHT_WORKSPACE_ORIGIN: origin,
  WOODRIGHT_LIVE_WRITES: "0",
  WOODRIGHT_WORKSPACE_SESSION_SECRET:
    "isolated-http-smoke-secret-not-a-live-credential",
};
delete env.MEDUSA_BACKEND_INTERNAL_URL;
delete env.MEDUSA_BACKEND_URL;
const child = spawn(process.execPath, ["scripts/start-live.mjs"], {
  cwd: process.cwd(),
  env,
  stdio: "ignore",
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "compiled app must start");
  const html = await (await fetch(origin)).text();
  assert.match(html, /Woodright OS/);
  const css = [
    ...new Set(
      [...html.matchAll(/href="([^\"]+\.css[^\"]*)"/g)].map((x) => x[1]),
    ),
  ];
  assert.ok(css.length);
  for (const path of css)
    assert.equal(
      (await fetch(origin + path)).status,
      200,
      "compiled CSS must be served",
    );
  for (const path of [
    "/api/live/data",
    "/api/live/session",
    "/api/live/history?entityType=person&entityId=person_test",
    "/api/live/files",
    "/api/live/attachments?entityType=person&entityId=person_test",
    "/api/live/media?productId=prod_test&index=0",
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 401, path);
    assert.match(r.headers.get("cache-control"), /no-store/);
  }
  const send = (path, requestOrigin) =>
    fetch(origin + path, {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: "{}",
    });
  assert.equal((await send("/api/live/commands", origin)).status, 401);
  assert.equal(
    (await send("/api/live/commands", "https://other.example")).status,
    403,
  );
  assert.equal(
    (await send("/api/live/session", "https://other.example")).status,
    403,
  );
  assert.equal((await send("/api/live/session", origin)).status, 400);
  const logout = await fetch(origin + "/api/live/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: '{"intent":"logout"}',
  });
  assert.equal(logout.status, 200);
  const cookie = logout.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Max-Age=0/i);
  console.log(
    "Compiled HTTP smoke passed: app, CSS, authentication, CSRF, cookie and cache boundary. No Medusa connection used.",
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
}
