import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStaffAccess,
  routeAllowed,
  authorizeDeskCommand,
  accessPages,
  STAFF_ROLES,
  type StaffAccess,
} from "./staff-access";
const access = (role: StaffAccess["role"]): StaffAccess => ({
  actorId: "worker",
  role,
  enabled: true,
  version: 1,
});
test("missing, unknown or disabled access never becomes administrator", () => {
  for (const metadata of [
    null,
    {},
    { woodright_access: { role: "owner", version: 1, enabled: true } },
    { woodright_access: { role: "god", version: 1, enabled: false } },
  ])
    assert.throws(() => parseStaffAccess({ id: "user", metadata }));
  assert.throws(() =>
    parseStaffAccess({
      id: "expired",
      metadata: {
        woodright_access: {
          role: "god",
          enabled: true,
          version: 1,
          expiresAt: "2000-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  assert.equal(
    parseStaffAccess({
      id: "user",
      metadata: {
        woodright_access: { role: "god", version: 1, enabled: true },
      },
    }).role,
    "god",
  );
});
test("ordinary staff cannot bypass workspace permissions through native Admin routes", () => {
  for (const role of STAFF_ROLES.filter((r) => r !== "god")) {
    for (const [method, path] of [
      ["POST", "/admin/users/worker"],
      ["POST", "/admin/users"],
      ["POST", "/admin/invites"],
      ["DELETE", "/admin/users/worker"],
      ["POST", "/admin/api-keys"],
      ["POST", "/admin/leads"],
      ["POST", "/admin/woodright/desk/access"],
    ])
      assert.equal(
        routeAllowed(role, method, path),
        false,
        `${role} ${method} ${path}`,
      );
    assert.equal(routeAllowed(role, "GET", "/admin/users/me"), true);
  }
});
test("production cannot read the general customer, order or company endpoints", () => {
  for (const path of [
    "/admin/leads",
    "/admin/bespoke-requests",
    "/admin/orders",
    "/admin/woodright/desk/companies",
  ])
    assert.equal(routeAllowed("production", "GET", path), false);
  assert.equal(
    routeAllowed("production", "GET", "/admin/woodright/desk/production"),
    true,
  );
  assert.equal(accessPages("production").includes("invoices"), false);
});
test("accounting can update companies and attach documents, without changing requests or assignments", async () => {
  const sql = { raw: async () => ({ rows: [] }) } as any;
  await authorizeDeskCommand(sql, access("accountant"), {
    type: "company.update",
  });
  await authorizeDeskCommand(sql, access("accountant"), {
    type: "attachment.upload",
  });
  for (const type of [
    "request.create",
    "request.update",
    "record.update",
    "person.update",
  ])
    await assert.rejects(
      authorizeDeskCommand(sql, access("accountant"), { type }),
      { code: "ROLE_FORBIDDEN" },
    );
});
test("a guessed file or request ID does not give production access, and financial statuses remain forbidden", async () => {
  const empty = { raw: async () => ({ rows: [] }) } as any;
  await assert.rejects(
    authorizeDeskCommand(empty, access("production"), {
      type: "attachment.upload",
      entityType: "request",
      entityId: "other",
    }),
    { code: "ASSIGNED_WORK_REQUIRED" },
  );
  const assigned = { raw: async () => ({ rows: [{}] }) } as any;
  await authorizeDeskCommand(assigned, access("production"), {
    type: "request.update",
    id: "owned",
    status: "in_production",
  });
  await assert.rejects(
    authorizeDeskCommand(assigned, access("production"), {
      type: "request.update",
      id: "owned",
      status: "paid",
    }),
    { code: "PRODUCTION_STATUS_ONLY" },
  );
  await assert.rejects(
    authorizeDeskCommand(assigned, access("production"), {
      type: "record.update",
      id: "owned",
    }),
    { code: "ROLE_FORBIDDEN" },
  );
});
test("non-managers cannot remove a colleague's attachment or reassign reminders", async () => {
  const sql = {
    raw: async () => ({
      rows: [
        {
          uploaded_by: "someone_else",
          entity_type: "request",
          entity_id: "owned",
          assignee_id: "someone_else",
        },
      ],
    }),
  } as any;
  await assert.rejects(
    authorizeDeskCommand(sql, access("seller"), {
      type: "attachment.remove",
      id: "file",
    }),
    { code: "FILE_OWNER_REQUIRED" },
  );
  await assert.rejects(
    authorizeDeskCommand(sql, access("accountant"), {
      type: "reminder.update",
      id: "reminder",
      assigneeId: "someone_else",
    }),
    { code: "ROLE_FORBIDDEN" },
  );
});
