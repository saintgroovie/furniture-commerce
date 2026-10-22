import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogAllowed,
  catalogId,
  catalogVersion,
  createBody,
  variantBody,
  withRubPrice,
  imagesBody,
  optionBody,
  imageMime,
} from "../src/server/catalog-policy.mjs";
import {
  assertSkuAvailable,
  executeCatalog,
  editorSnapshot,
  catalogLock,
} from "../src/server/catalog-service.mjs";
const product = () => ({
  id: "prod_test",
  title: "Existing product",
  subtitle: "",
  description: "Original",
  status: "draft",
  updated_at: "2026-10-22",
  metadata: { preserve: true },
  thumbnail: "/static/a.jpg",
  images: [
    { id: "img_a", url: "/static/a.jpg" },
    { id: "img_b", url: "/static/b.jpg" },
  ],
  options: [
    {
      id: "opt_a",
      title: "Size",
      values: [
        { id: "val_s", value: "S" },
        { id: "val_m", value: "M" },
      ],
    },
  ],
  variants: [
    {
      id: "variant_test",
      title: "S",
      sku: "TEST-S",
      options: [{ option_id: "opt_a", value: "S" }],
      prices: [
        {
          id: "price_rub",
          currency_code: "rub",
          amount: 90000,
          min_quantity: null,
          max_quantity: null,
          rules: {},
        },
        { id: "price_eur", currency_code: "eur", amount: 900, rules: {} },
        {
          id: "price_bulk",
          currency_code: "rub",
          amount: 80000,
          min_quantity: 10,
          rules: { region_id: "reg_a" },
        },
      ],
    },
  ],
});
const seller = () => ({
  id: "prod_test",
  image_urls: ["/static/a.jpg", "/static/b.jpg"],
  general_image_urls: ["/static/a.jpg", "/static/b.jpg"],
  execution_media_guard: false,
  publish: { ready: true, blockers: [] },
});
function port(p = product(), s = seller()) {
  const writes = [];
  const send = async (path, method = "GET", body) => {
    if (method !== "GET") {
      writes.push({ path, method, body });
      if (path === "/admin/products/prod_test" && body.title)
        p.title = body.title;
      return { product: p };
    }
    if (path === "/admin/products/prod_test")
      return { product: structuredClone(p) };
    if (path === "/admin/woodright/products/prod_test")
      return { product: structuredClone(s) };
    throw new Error(`unexpected read ${path}`);
  };
  return { p, s, writes, send };
}
test("catalog keeps existing administrator permissions and fails closed", () => {
  assert.equal(catalogAllowed({ access: { role: "god" } }), true);
  for (const role of [
    "seller",
    "director",
    "accountant",
    "production",
    null,
    "owner",
  ])
    assert.equal(catalogAllowed({ access: { role } }), false);
  assert.equal(catalogAllowed({}), false);
  assert.throws(() => catalogId("../users/me"));
});
test("new drafts accept only a supported classification and collection", () => {
  assert.equal(
    createBody({
      title: " Chair ",
      sku: " TEST-1 ",
      classification: "STANDARD",
      collection_key: "oliver",
    }).title,
    "Chair",
  );
  assert.throws(() =>
    createBody({
      title: "X",
      sku: "T",
      classification: "other",
      collection_key: "oliver",
    }),
  );
  assert.throws(() =>
    createBody({
      title: "X",
      sku: "T",
      classification: "STANDARD",
      collection_key: "unknown",
    }),
  );
});
test("updating RUB preserves foreign currency, quantity prices and rules", () => {
  const p = product(),
    v = p.variants[0];
  const next = withRubPrice(v, "95 000,50");
  assert.equal(next[0].amount, 95000.5);
  assert.equal(next[1].amount, 900);
  assert.equal(next[1].id, "price_eur");
  assert.deepEqual(next[2], {
    id: "price_bulk",
    currency_code: "rub",
    amount: 80000,
    min_quantity: 10,
    max_quantity: null,
    rules: { region_id: "reg_a" },
  });
  assert.equal(v.prices[0].amount, 90000);
});
test("empty invalid negative and very large prices cannot become zero", () => {
  for (const v of ["", "abc", "0", "-1", "12.123", "10000001", "Infinity"])
    assert.throws(() => withRubPrice({ prices: [] }, v));
  assert.throws(() => withRubPrice(product().variants[0], "1"), /Подтвердите/);
  assert.equal(withRubPrice(product().variants[0], "1", true)[0].amount, 1);
});
test("ambiguous RUB base prices are refused rather than replacing the wrong one", () => {
  const v = product().variants[0];
  v.prices.push({ ...v.prices[0], id: "second" });
  assert.throws(() => withRubPrice(v, "100000"), /несколько/);
});
test("variants require membership, valid option values and unique combinations", () => {
  const p = product();
  const input = {
    title: "M",
    sku: "TEST-M",
    price: "99000",
    options: { opt_a: "M" },
  };
  const body = variantBody(input, p);
  assert.deepEqual(body.options, { Size: "M" });
  assert.equal(body.manage_inventory, false);
  assert.throws(
    () => variantBody({ ...input, variantId: "foreign" }, p),
    /не принадлежит/,
  );
  assert.throws(() => variantBody({ ...input, options: { opt_a: "XXL" } }, p));
  assert.throws(() =>
    variantBody({ ...input, options: { opt_a: "M", foreign: "other" } }, p),
  );
  assert.throws(() => variantBody({ ...input, sku: "test-s" }, p), /артикул/);
  assert.throws(
    () => variantBody({ ...input, options: { opt_a: "S" } }, p),
    /сочетанием/,
  );
});
test("blank price on existing variant omits prices and preserves inventory settings", () => {
  const p = product();
  const body = variantBody(
    {
      variantId: "variant_test",
      title: "Renamed",
      sku: "TEST-S",
      options: { opt_a: "S" },
      price: "",
    },
    p,
  );
  assert.equal(Object.hasOwn(body, "prices"), false);
  assert.equal(Object.hasOwn(body, "manage_inventory"), false);
});
test("photos preserve native IDs, accept reordering and cannot attach arbitrary remote URLs", () => {
  const p = product();
  const body = imagesBody(
    { images: ["/static/b.jpg", "/static/a.jpg"], thumbnail: "/static/b.jpg" },
    p,
    seller(),
  );
  assert.deepEqual(body.images, [p.images[1], p.images[0]]);
  assert.throws(() =>
    imagesBody(
      { images: ["https://attacker.test/file.jpg"], thumbnail: null },
      p,
      seller(),
    ),
  );
  assert.throws(() =>
    imagesBody(
      { images: ["/static/a.jpg"], thumbnail: "/static/b.jpg" },
      p,
      seller(),
    ),
  );
  assert.throws(() =>
    imagesBody(
      { images: ["/static/a.jpg", "/static/a.jpg"], thumbnail: null },
      p,
      seller(),
    ),
  );
});
test("execution-bound photos cannot be removed and metadata stays untouched", () => {
  const p = product(),
    s = {
      ...seller(),
      execution_media_guard: true,
      general_image_urls: ["/static/a.jpg"],
    };
  assert.throws(
    () =>
      imagesBody(
        { images: ["/static/a.jpg"], thumbnail: "/static/a.jpg" },
        p,
        s,
      ),
    /исполнению/,
  );
  assert.equal(
    imagesBody({ images: ["/static/b.jpg"], thumbnail: "/static/b.jpg" }, p, s)
      .images.length,
    1,
  );
  assert.deepEqual(p.metadata, { preserve: true });
});
test("new option values are linked to this product without replacing a shared global definition", () => {
  assert.deepEqual(optionBody({ optionId: "opt_a", value: "L" }, product()), {
    update: [{ product_option_id: "opt_a", add: [{ value: "L" }] }],
  });
  assert.throws(() => optionBody({ optionId: "other", value: "L" }, product()));
  assert.throws(() => optionBody({ optionId: "opt_a", value: "S" }, product()));
});
test("version detects nested variant price edits even without a product timestamp update", () => {
  const p = product(),
    old = catalogVersion(p);
  p.variants[0].prices[0].amount++;
  assert.notEqual(catalogVersion(p), old);
});
test("stale snapshots and unknown command fields produce no native writes", async () => {
  const a = port();
  await assert.rejects(
    executeCatalog(
      {
        type: "basics",
        id: a.p.id,
        version: "stale",
        title: "New",
        subtitle: "",
        description: "",
      },
      a.send,
    ),
    /изменилась/,
  );
  assert.equal(a.writes.length, 0);
  await assert.rejects(
    executeCatalog(
      {
        type: "basics",
        id: a.p.id,
        version: catalogVersion(a.p),
        title: "New",
        subtitle: "",
        description: "",
        status: "published",
      },
      a.send,
    ),
    /Неизвестное поле/,
  );
  await assert.rejects(
    executeCatalog({ type: "constructor" }, a.send),
    /Неизвестное действие/,
  );
  assert.equal(a.writes.length, 0);
});
test("basic save uses a narrow native patch and rereads committed data", async () => {
  const a = port();
  const p = await executeCatalog(
    {
      type: "basics",
      id: a.p.id,
      version: catalogVersion(a.p),
      title: "New",
      subtitle: "",
      description: "Updated",
    },
    a.send,
  );
  assert.equal(p.title, "New");
  assert.deepEqual(a.writes, [
    {
      path: "/admin/products/prod_test",
      method: "POST",
      body: { title: "New", subtitle: "", description: "Updated" },
    },
  ]);
  assert.notEqual(p.version, catalogVersion(product()));
  assert.equal(a.p.status, "draft");
});
test("publish cannot bypass backend readiness and variant requests remain scoped", async () => {
  const a = port();
  a.s.publish.ready = false;
  await assert.rejects(
    executeCatalog(
      { type: "publish", id: a.p.id, version: catalogVersion(a.p) },
      a.send,
    ),
  );
  assert.equal(a.writes.length, 0);
  await assert.rejects(
    executeCatalog(
      {
        type: "variant",
        id: a.p.id,
        version: catalogVersion(a.p),
        variantId: "foreign",
        title: "X",
        sku: "X",
        price: "1000",
        options: {},
      },
      a.send,
    ),
  );
  assert.equal(a.writes.length, 0);
});
test("one workspace writer per product; locks release after a failed native operation", async () => {
  let finish;
  const work = catalogLock(
    "serialized",
    () => new Promise((r) => (finish = r)),
  );
  await assert.rejects(
    catalogLock("serialized", async () => {}),
    /сохраняется/,
  );
  finish();
  await work;
  await assert.rejects(
    catalogLock("serialized", async () => {
      throw new Error("failed");
    }),
  );
  await catalogLock("serialized", async () => {});
});
test("native read failure after a write remains an uncertain result rather than false success", async () => {
  const a = port();
  let written = false;
  const send = async (...args) => {
    if (written && args[1] !== "POST") throw new Error("read unavailable");
    const r = await a.send(...args);
    if (args[1] === "POST") written = true;
    return r;
  };
  await assert.rejects(
    executeCatalog(
      {
        type: "basics",
        id: a.p.id,
        version: catalogVersion(a.p),
        title: "New",
        subtitle: "",
        description: "",
      },
      send,
    ),
    /read unavailable/,
  );
  assert.equal(a.writes.length, 1);
});
test("photo signatures reject disguised SVG, HTML and mismatched files", () => {
  assert.equal(imageMime(Buffer.from("<svg></svg>")), null);
  assert.equal(imageMime(Buffer.from("<html>")), null);
  assert.equal(imageMime(Buffer.from([255, 216, 255, 1])), "image/jpeg");
  assert.equal(
    imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
});
test("editor snapshot distinguishes protected execution media from general photos", () => {
  const p = editorSnapshot({
    product: product(),
    seller: {
      ...seller(),
      execution_media_guard: true,
      general_image_urls: ["/static/a.jpg"],
    },
  });
  assert.equal(p.images[0].protected, false);
  assert.equal(p.images[1].protected, true);
  assert.equal(p.variants[0].price, 90000);
  assert.deepEqual(p.variants[0].options, { opt_a: "S" });
  assert.equal(Object.hasOwn(p, "metadata"), false);
});

test("SKU uniqueness is checked across the full catalogue, ignoring case and excluding the current native variant", async () => {
  const send = async () => ({
    products: [{ variants: [{ id: "own", sku: "MiXeD-SKU" }] }],
  });
  await assert.rejects(assertSkuAvailable("mixed-sku", send), /артикул/);
  await assertSkuAvailable("mixed-sku", send, "own");
  await assertSkuAvailable("new-sku", send);
  await assert.rejects(
    assertSkuAvailable("new-sku", async () => ({})),
    /уникальность/,
  );
});

test("publication associates an unassigned draft only with the store's explicit default channel", async () => {
  const a = port();
  const send = async (path, ...args) =>
    path.startsWith("/admin/stores?")
      ? { stores: [{ id: "store_a", default_sales_channel_id: "sc_default" }] }
      : a.send(path, ...args);
  await executeCatalog(
    { type: "publish", id: a.p.id, version: catalogVersion(a.p) },
    send,
  );
  assert.deepEqual(
    a.writes.map((w) => ({ path: w.path, body: w.body })),
    [
      {
        path: "/admin/products/prod_test",
        body: { sales_channels: [{ id: "sc_default" }] },
      },
      { path: "/admin/woodright/products/prod_test/publish", body: {} },
    ],
  );
  const b = port();
  await assert.rejects(
    executeCatalog(
      { type: "publish", id: b.p.id, version: catalogVersion(b.p) },
      async (path, ...args) =>
        path.startsWith("/admin/stores?")
          ? { stores: [] }
          : b.send(path, ...args),
    ),
    /витрина/,
  );
  assert.equal(b.writes.length, 0);
});
