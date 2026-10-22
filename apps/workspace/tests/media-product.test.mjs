import test from "node:test";
import assert from "node:assert/strict";
import { readMediaProduct } from "../src/server/media-product.mjs";
test("full administrator media keeps the native detail read", async () => {
  const calls = [];
  const p = await readMediaProduct("prod_a", async (path) => {
    calls.push(path);
    return { product: { id: "prod_a" } };
  });
  assert.equal(p.id, "prod_a");
  assert.deepEqual(calls, ["/admin/woodright/products/prod_a"]);
});
test("seller media uses only the same actor authorized catalog and exact product ID", async () => {
  const calls = [];
  const p = await readMediaProduct("prod_a", async (path) => {
    calls.push(path);
    if (calls.length === 1)
      throw Object.assign(new Error("denied"), { status: 403 });
    return {
      products: [
        { id: "prod_ab", thumbnail: "wrong" },
        { id: "prod_a", thumbnail: "right" },
      ],
    };
  });
  assert.equal(p.thumbnail, "right");
  assert.deepEqual(calls, [
    "/admin/woodright/products/prod_a",
    "/admin/woodright/products",
  ]);
});
test("media fallback does not bypass an accountant or production catalog denial", async () => {
  await assert.rejects(
    readMediaProduct("prod_a", async () => {
      throw Object.assign(new Error("denied"), { status: 403 });
    }),
    { status: 403 },
  );
});
test("missing IDs do not borrow another photo; operational errors do not trigger a wider read", async () => {
  assert.equal(
    await readMediaProduct("missing", async (path) => {
      if (path.endsWith("/missing"))
        throw Object.assign(new Error("denied"), { status: 403 });
      return { products: [{ id: "prod_a" }] };
    }),
    null,
  );
  let reads = 0;
  await assert.rejects(
    readMediaProduct("prod_a", async () => {
      reads++;
      throw Object.assign(new Error("unavailable"), { status: 503 });
    }),
    { status: 503 },
  );
  assert.equal(reads, 1);
});
