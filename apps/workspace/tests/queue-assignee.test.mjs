import test from "node:test";
import assert from "node:assert/strict";
import { queueAssignee } from "../src/premium/model.mjs";

const contact = { assignee: "Продавец" };
test("request preview shows the assigned production employee independently of the contact owner", () => {
  assert.equal(queueAssignee("request", { assignee: "Производство" }, contact), "Производство");
});
test("order preview shows its own assignee", () => {
  assert.equal(queueAssignee("order", { assignee: "Другой сотрудник" }, contact), "Другой сотрудник");
});
test("unassigned work does not inherit contact ownership", () => {
  for (const kind of ["request", "order"]) {
    assert.equal(queueAssignee(kind, { assignee: "Не назначен" }, contact), "Не назначен");
    assert.equal(queueAssignee(kind, {}, contact), "Не назначен");
  }
});
test("unknown assignment remains explicit", () => {
  assert.equal(queueAssignee("request", { assignee: "Назначение не загружено" }, contact), "Назначение не загружено");
});
test("an assigned request works without a contact", () => {
  assert.equal(queueAssignee("request", { assignee: "Производство" }), "Производство");
});
test("reminders keep their contact context", () => {
  assert.equal(queueAssignee("reminder", {}, contact), "Продавец");
  assert.equal(queueAssignee("reminder", {}), "Не назначен");
});
