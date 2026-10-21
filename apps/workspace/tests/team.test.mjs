import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { projectLive } from "../src/server/live-projection.mjs";
test("company and employee links come from persisted relations, never matching email", () => {
  const states = {
    companies: { ok: true },
    staff: { ok: true },
    records: { ok: true, truncated: false },
  };
  const sources = {
    people: {
      leads: [
        { id: "p1", name: "Контакт", email: "same@example.test" },
        { id: "p2", email: "same@example.test" },
      ],
    },
    companies: {
      companies: [
        {
          id: "c1",
          name: "Студия",
          email: "same@example.test",
          status: "active",
          version: 2,
        },
      ],
    },
    staff: {
      staff: [{ id: "u1", email: "staff@example.test", first_name: "Анна" }],
    },
    records: {
      records: [
        {
          entity_type: "person",
          entity_id: "p1",
          company_id: "c1",
          assignee_id: "u1",
          version: 3,
        },
      ],
    },
  };
  const d = projectLive(
    sources,
    { email: "staff@example.test" },
    states,
    {},
    {
      contract: "woodright-desk-v1",
      writesEnabled: true,
      companies: true,
      assignments: true,
    },
  );
  assert.equal(d.people[0].companyId, "c1");
  assert.equal(d.people[0].assignee, "Анна");
  assert.equal(d.people[0].assignmentVersion, 3);
  assert.equal(d.people[1].companyId, "");
  assert.equal(d.people[1].assigneeId, "");
  assert.equal(d.session.id, "u1");
  assert.equal(d.capabilities.assignments, true);
});
test("an incomplete relation snapshot cannot claim unassigned records or enable assignment", () => {
  const d = projectLive(
    { people: { leads: [{ id: "p1" }] } },
    { email: "staff@example.test" },
    {
      records: { ok: true, truncated: true },
      staff: { ok: true },
      companies: { ok: true },
    },
    {},
    {
      contract: "woodright-desk-v1",
      writesEnabled: true,
      companies: true,
      assignments: true,
    },
  );
  assert.equal(d.people[0].assignmentKnown, false);
  assert.equal(d.capabilities.assignments, false);
  assert.equal(d.people[0].assignee, "Назначение не загружено");
});
test("hosted paths keep API and files under /os and reject outside destinations", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {workspacePath} from "./src/lib/paths.mjs"; console.log(workspacePath("/api/live/files")); try{workspacePath("//outside.example");process.exitCode=2}catch{}',
    ],
    {
      env: { ...process.env, NEXT_PUBLIC_WORKSPACE_BASE_PATH: "/os" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "/os/api/live/files");
});
