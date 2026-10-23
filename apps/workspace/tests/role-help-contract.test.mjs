import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { roleHelp } from "../src/premium/role-help.mjs";

// Load the actual backend access contract without starting Medusa or a database.
// Imported command helpers are never exercised by accessPages/roleCapabilities.
const accessPath = new URL("../../backend/src/lib/woodright-desk/staff-access.ts", import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(accessPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const backend = { exports: {} };
vm.runInNewContext(compiled, {
  exports: backend.exports,
  require(specifier) {
    assert.equal(specifier, "./commands", "Unexpected dependency in role contract fixture");
    return { DeskError: class extends Error {}, identifier() { throw new Error("Command helpers must not run"); } };
  },
}, { filename: accessPath.pathname });

for (const role of backend.exports.STAFF_ROLES) {
  test(`${role} help destinations and title match actual backend access`, () => {
    const access = backend.exports.roleCapabilities(role).access;
    const guide = roleHelp(role);
    assert.ok(guide, `Missing guide for supported role ${role}`);
    assert.equal(guide.title, access.label);
    const destinations = guide.sections.map((section) => section[2]).filter(Boolean);
    assert.ok(destinations.length > 0);
    for (const page of destinations) assert.ok(access.pages.includes(page), `${role} instruction links to forbidden ${page}`);
    if (role === "production") {
      assert.equal(access.financial, false);
      for (const page of ["companies", "people", "invoices", "team"]) assert.ok(!destinations.includes(page));
    }
    if (role === "accountant") assert.ok(!destinations.includes("requests"));
  });
}

test("unknown and inherited-property role names receive no guide", () => {
  for (const role of [undefined, null, "", "administrator", "__proto__", "constructor", "toString"]) {
    assert.equal(roleHelp(role), null);
  }
});
