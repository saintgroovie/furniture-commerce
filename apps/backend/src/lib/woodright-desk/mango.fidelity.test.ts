import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildMangoCallback,
  mangoSignature,
  normalizeExternalPhone,
  parseMangoCall,
  verifyMangoForm,
} from "./mango";
const credentials = {
  apiKey: "disposable-test-vpbx",
  signingKey: "disposable-test-signing-key",
};
const event = {
  call_id: "leg:123",
  entry_id: "entry=456",
  seq: "2",
  timestamp: 1792500000,
  call_state: "Connected",
  location: "abonent",
  from: { number: "+7 (900) 000-00-01" },
  to: { extension: "101", number: "sip:operator@example.test" },
};
test("MANGO signs the exact received JSON, validates key and rejects modified payloads", () => {
  const json = JSON.stringify(event),
    sign = mangoSignature(json, credentials);
  assert.equal(
    sign,
    createHash("sha256")
      .update(credentials.apiKey + json + credentials.signingKey)
      .digest("hex"),
  );
  assert.equal(
    verifyMangoForm(
      { vpbx_api_key: credentials.apiKey, json, sign },
      credentials,
    ).event.call_id,
    "leg:123",
  );
  assert.throws(
    () =>
      verifyMangoForm(
        { vpbx_api_key: credentials.apiKey, json: json + " ", sign },
        credentials,
      ),
    (e: any) => e.status === 401,
  );
  assert.throws(
    () => verifyMangoForm({ vpbx_api_key: "wrong", json, sign }, credentials),
    (e: any) => e.status === 401,
  );
  assert.throws(
    () =>
      verifyMangoForm(
        { vpbx_api_key: credentials.apiKey, json, sign: "" },
        credentials,
      ),
    (e: any) => e.status === 401,
  );
});
test("call legs and parent entry stay separate; numeric sequence and initial Connected are supported", () => {
  const call = parseMangoCall(event);
  assert.equal(call.callId, "leg:123");
  assert.equal(call.entryId, "entry=456");
  assert.equal(call.seq, 2);
  assert.equal(call.state, "Connected");
  assert.equal(call.timestamp, event.timestamp);
  assert.throws(() => parseMangoCall({ ...event, seq: "-1" }));
  assert.throws(() => parseMangoCall({ ...event, call_state: "Invented" }));
});
test("phone normalization does not interpret SIP addresses or extensions as client numbers", () => {
  assert.equal(normalizeExternalPhone("8 (900) 000-00-01"), "79000000001");
  assert.equal(normalizeExternalPhone("+7 900 000 00 01"), "79000000001");
  assert.equal(normalizeExternalPhone("101"), null);
  assert.equal(normalizeExternalPhone("sip:79000000001@example.test"), null);
  assert.equal(normalizeExternalPhone("+79000000001 доб. 101"), null);
});
test("callback uses the server staff mapping and never claims provider-side deduplication", () => {
  const input = {
    operationId: "operation_20261020_123",
    staffId: "staff_1",
    phone: "+7 900 000-00-01",
  };
  const intent = buildMangoCallback(input, { staff_1: "101" });
  assert.equal(intent.payload.from.extension, "101");
  assert.equal(intent.payload.to_number, "79000000001");
  assert.equal(intent.retryPolicy, "reconcile-before-retry");
  assert.throws(
    () => buildMangoCallback(input, {}),
    (e: any) => e.code === "MANGO_STAFF_MAPPING",
  );
});
