// Explicit synthetic HTTP rehearsal only. Never points to a live identity or invites a real recipient.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.WOODRIGHT_TEAM_QA_URL;
if (process.env.WOODRIGHT_TEAM_HTTP_QA !== "1" || !base)
  throw Error("Explicit isolated HTTP QA required");
const target = new URL(base);
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.pathname !== "/os"
)
  throw Error("Only loopback /os QA allowed");
async function api(path, { body, cookie, status = 200 } = {}) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: target.origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, status, `${path}: ${data.message || r.status}`);
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const status = (await api("/api/live/status")).data;
assert.equal(status.environment, "non_public_candidate");
assert.equal(status.connected, true);
const owner = (
  await api("/api/live/session", {
    body: { email: "team-owner@example.test", password: "Team-QA-20261021" },
  })
).cookie;
assert.ok(owner);
assert.match(owner, /^wr_os_\d+=/);
await api("/api/live/data", {
  cookie: `wr_desk=invalid-legacy-session; ${owner}`,
});
const snapshot = (await api("/api/live/data", { cookie: owner })).data;
assert.equal(snapshot.identity.databaseAlias, "non_public_candidate_db");
assert.equal(snapshot.capabilities.assignments, true);
assert.equal(snapshot.capabilities.companies, true);
const run = randomUUID(),
  companyId = "company_" + run;
await api("/api/live/commands", {
  cookie: owner,
  body: {
    type: "company.create",
    id: companyId,
    key: randomUUID(),
    company: {
      name: "Компания · проверка команды",
      notes: "Только синтетические данные",
    },
  },
});
const upload = (
  await api("/api/live/commands", {
    cookie: owner,
    body: {
      type: "attachment.upload",
      id: "desk_" + randomUUID(),
      entityType: "company",
      entityId: companyId,
      filename: "team-qa.txt",
      content: Buffer.from("abc").toString("base64"),
      key: randomUUID(),
    },
  })
).data;
const files = (
  await api(`/api/live/attachments?entityType=company&entityId=${companyId}`, {
    cookie: owner,
  })
).data.attachments;
assert.equal(files.length, 1);
const history = (
  await api(`/api/live/history?entityType=company&entityId=${companyId}`, {
    cookie: owner,
  })
).data.events;
assert.ok(history.length >= 2);
const download = await fetch(`${base}/api/live/attachments/${files[0].id}`, {
  headers: { cookie: owner },
});
assert.equal(download.status, 200);
assert.equal(await download.text(), "abc");
assert.equal(
  (await fetch(`${base}/api/live/attachments/${files[0].id}`)).status,
  401,
);
const invitation = (
  await api("/api/live/team", {
    cookie: owner,
    body: { intent: "invite", email: `team-join-${run}@example.test` },
  })
).data;
const token = decodeURIComponent(
  new URL(invitation.url).hash.split("/").at(-1),
);
assert.ok(token);
const inspected = (
  await api("/api/live/join", { body: { intent: "inspect", token } })
).data;
assert.equal(inspected.email, invitation.email);
const joined = await api("/api/live/join", {
  body: {
    intent: "accept",
    token,
    name: "Коллега QA",
    password: "Team-Join-20261021",
  },
});
assert.ok(joined.cookie);
const fresh = (await api("/api/live/data", { cookie: joined.cookie })).data;
assert.equal(fresh.session.email, invitation.email);
assert.ok(fresh.session.id);
assert.equal(fresh.capabilities.assignments, true);
await api("/api/live/join", {
  body: { intent: "inspect", token },
  status: 401,
});
await api("/api/live/commands", {
  cookie: owner,
  body: {
    type: "record.update",
    id: "request_desk_qa",
    entityType: "request",
    expectedVersion: snapshot.requests.find((r) => r.id === "request_desk_qa")
      .assignmentVersion,
    ownership: { companyId, assigneeId: fresh.session.id },
    key: randomUUID(),
  },
});
const assigned = (
  await api("/api/live/data", { cookie: joined.cookie })
).data.requests.find((r) => r.id === "request_desk_qa");
assert.equal(assigned.assigneeId, fresh.session.id);
assert.equal(assigned.companyId, companyId);
await api("/api/live/password", {
  cookie: joined.cookie,
  body: {
    currentPassword: "Team-Join-20261021",
    newPassword: "Team-Changed-20261021",
  },
});
await api("/api/live/session", {
  body: { email: invitation.email, password: "Team-Join-20261021" },
  status: 401,
});
await api("/api/live/session", {
  body: { email: invitation.email, password: "Team-Changed-20261021" },
});
console.log(
  "ISOLATED_TEAM_HTTP_FLOW_PASS: invite, one-use acceptance, staff login, company, ownership, password update and old-password refusal",
);
