/** Isolated native Medusa workflow acceptance. Never run against public/candidate data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecArgs, IUserModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension";
import { POST as command } from "../api/admin/woodright/desk/commands/route";
import { GET as list } from "../api/admin/woodright/desk/orders/route";
import { GET as production } from "../api/admin/woodright/desk/production/route";
import { GET as invoiceList } from "../api/admin/woodright/desk/invoices/route";
import { GET as download } from "../api/admin/woodright/desk/attachments/[id]/content/route";
import { type StaffRole } from "../lib/woodright-desk/staff-access";

export default async function check({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
  assert.match(
    database.pathname,
    /^\/workspace_it_(orders_native_[a-zA-Z0-9_]+|desk_http)$/,
  );
  assert.equal(process.env.WOODRIGHT_OS_ORDERS_NATIVE_QA, "isolated-only");
  assert.notEqual(process.env.WOODRIGHT_EXPOSURE, "public");
  const sql = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
  assert.equal(
    (await sql.raw("select current_database() as name")).rows[0].name,
    database.pathname.slice(1),
    "Actual native database must match the isolated target",
  );
  assert.equal(
    Number((await sql.raw('select count(*) as n from "order"')).rows[0].n),
    0,
    "New disposable native database only",
  );
  const users = container.resolve<IUserModuleService>(Modules.USER),
    store = container.resolve(Modules.STORE) as any;
  const roles: StaffRole[] = [
    "seller",
    "production",
    "accountant",
    "director",
    "god",
  ];
  const staff: any = {};
  const directory = await mkdtemp(
    path.join(await realpath(tmpdir()), "woodright-orders-native-"),
  );
  const oldFiles = process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
  process.env.WOODRIGHT_PRIVATE_FILES_ROOT = directory;
  process.env.WOODRIGHT_DESK_FEATURES = "1";
  const checks: string[] = [];
  let primaryError: unknown;
  const stage = (name: string) => console.log("OS_ORDERS_NATIVE_STAGE", name);
  const response = () => ({
    statusCode: 200,
    body: null as any,
    headers: {} as any,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    json(v: any) {
      this.body = v;
    },
    send(v: any) {
      this.body = v;
    },
  });
  const request = (role: StaffRole, body: any = {}, params: any = {}) =>
    ({
      scope: container,
      auth_context: { actor_id: staff[role].id, actor_type: "user" },
      body,
      params,
      query: {},
    }) as any;
  async function send(role: StaffRole, body: any, expected = 200) {
    const res = response();
    await command(
      request(role, { id: `desk_${randomUUID()}`, key: randomUUID(), ...body }),
      res as any,
    );
    assert.equal(
      res.statusCode,
      expected,
      JSON.stringify({ role, type: body.type, response: res.body }),
    );
    return res.body;
  }
  try {
    for (const role of roles)
      staff[role] = await users.createUsers({
        email: `qa-orders-${role}@example.test`,
        metadata: { woodright_access: { role, enabled: true, version: 1 } },
      });
    stage("roles_created");
    const channels = container.resolve(Modules.SALES_CHANNEL) as any;
    const channel = await channels.createSalesChannels({
      name: "Isolated orders QA",
    });
    let [shop] = await store.listStores();
    if (!shop)
      shop = (
        await createStoresWorkflow(container).run({
          input: {
            stores: [
              {
                name: "Isolated orders QA",
                supported_currencies: [
                  { currency_code: "rub", is_default: true },
                ],
              },
            ],
          },
        })
      ).result[0];
    await store.updateStores(shop.id, { default_sales_channel_id: channel.id });
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          { name: "Isolated QA RUB", currency_code: "rub", countries: ["ru"] },
        ],
      },
    });
    const { result: products } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Isolated QA table",
            status: "published",
            options: [{ title: "Finish", values: ["Oak", "Walnut"] }],
            variants: [
              {
                title: "Oak",
                sku: "QA-ORDERS-OAK",
                manage_inventory: false,
                options: { Finish: "Oak" },
                prices: [
                  { currency_code: "rub", amount: 12.34, min_quantity: 10 },
                  { currency_code: "rub", amount: 123.45 },
                ],
              },
              {
                title: "Walnut",
                sku: "QA-ORDERS-WALNUT",
                manage_inventory: false,
                options: { Finish: "Walnut" },
                prices: [{ currency_code: "rub", amount: 234.56 }],
              },
            ],
          },
        ],
      },
    });
    const product = products[0];
    const rawClassification = await (
      container.resolve(PRODUCT_EXTENSION_MODULE) as any
    ).createProductClassifications({ product_type: "CONFIGURABLE" });
    const classification = Array.isArray(rawClassification)
      ? rawClassification[0]
      : rawClassification;
    await (container.resolve("link") as any).create({
      [Modules.PRODUCT]: { product_id: product.id },
      [PRODUCT_EXTENSION_MODULE]: {
        product_classification_id: classification.id,
      },
    });
    stage("catalog_created");
    await send("seller", {
      type: "company.create",
      id: "company_orders_native",
      company: { name: "Isolated QA company" },
    });
    await send("seller", {
      type: "person.create",
      id: "person_orders_native",
      person: {
        name: "Isolated QA person",
        email: "customer-orders@example.test",
        phone: "",
        comment: "",
      },
    });
    const source = await send("seller", {
      type: "request.create",
      id: "request_orders_native",
      personId: "person_orders_native",
      title: "Isolated QA order source",
      ownership: {
        companyId: "company_orders_native",
        assigneeId: staff.production.id,
      },
    });
    const input = {
      requestId: "request_orders_native",
      expectedUpdatedAt: new Date(
        source.result.bespoke_request.updated_at,
      ).toISOString(),
      notes: "Isolated specification",
      lines: [
        {
          productId: product.id,
          variantId: product.variants[0].id,
          quantity: 2,
          unitPriceMinor: 12345,
        },
        {
          productId: product.id,
          variantId: product.variants[1].id,
          quantity: 1,
          unitPriceMinor: 23456,
        },
      ],
    };
    stage("request_created");
    const first = await send("seller", { type: "order.create", order: input });
    stage("native_order_created");
    const id = first.result.order.id;
    const again = await send("director", {
      type: "order.create",
      order: input,
    });
    assert.equal(again.result.order.id, id);
    assert.equal(
      Number((await sql.raw('select count(*) as n from "order"')).rows[0].n),
      1,
    );
    checks.push(
      "real native createOrderWorkflow preserves deterministic ID and prevents duplicate request orders",
    );
    for (const role of ["accountant", "production"] as StaffRole[])
      await send(role, { type: "order.create", order: input }, 403);
    for (const role of [
      "seller",
      "accountant",
      "director",
      "god",
    ] as StaffRole[]) {
      const res = response();
      await list(request(role), res as any);
      assert.equal(res.statusCode, 200);
      const found = res.body.orders.find((o: any) => o.id === id);
      assert.ok(found, role);
      assert.equal(found.status, "draft");
      const oakLine = found.items.find(
        (i: any) => i.variant_id === product.variants[0].id,
      );
      assert.ok(oakLine);
      assert.equal(Number(oakLine.unit_price), 123.45);
      assert.equal(found.items.length, 2);
      assert.ok(
        found.items.some((i: any) => i.variant_id === product.variants[1].id),
      );
      assert.equal(Number(found.total), 481.46);
    }
    const work = response();
    await production(request("production"), work as any);
    assert.equal(work.statusCode, 200);
    assert.ok(work.body.orders.orders.find((o: any) => o.id === id));
    assert.ok(!JSON.stringify(work.body).includes("unit_price"));
    assert.ok(
      !JSON.stringify(work.body).includes("customer-orders@example.test"),
    );
    const financial = response();
    await list(request("production"), financial as any);
    assert.equal(financial.statusCode, 403);
    checks.push(
      "native draft and two catalog variants persist; assigned production sees sanitized order, ordinary roles cannot bypass creation rights",
    );
    for (const visibility of ["business", "assigned"])
      await send("seller", {
        type: "attachment.upload",
        id: `file_native_${visibility}`,
        entityType: "order",
        entityId: id,
        filename: `${visibility}.txt`,
        visibility,
        content: Buffer.from("Native isolated order file").toString("base64"),
      });
    for (const role of roles) {
      const res = response();
      await download(
        request(role, {}, { id: "file_native_assigned" }),
        res as any,
      );
      assert.equal(res.statusCode, 200, role);
      assert.equal(res.body.toString(), "Native isolated order file");
    }
    const hidden = response();
    await download(
      request("production", {}, { id: "file_native_business" }),
      hidden as any,
    );
    assert.equal(hidden.statusCode, 403);
    const record = (
      await sql.raw(
        "select version from woodright_desk_record where entity_type='order' and entity_id=?",
        [id],
      )
    ).rows[0];
    await send("seller", {
      type: "record.update",
      id,
      entityType: "order",
      expectedVersion: record.version,
      ownership: {
        companyId: "company_orders_native",
        assigneeId: staff.seller.id,
      },
    });
    const revoked = response();
    await download(
      request("production", {}, { id: "file_native_assigned" }),
      revoked as any,
    );
    assert.equal(revoked.statusCode, 403);
    checks.push(
      "real private order file bytes shared across5roles; business-only and reassigned files correctly denied production",
    );
    await send("seller", {
      type: "invoice.create",
      id: "invoice_orders_native",
      invoice: {
        sourceType: "order",
        sourceId: id,
        companyId: "company_orders_native",
        payer: { type: "person", name: "Isolated QA payer" },
        lines: [
          {
            name: "Isolated QA table / Oak",
            variantId: product.variants[0].id,
            quantity: "2",
            unitPriceMinor: 12345,
          },
        ],
        notes: "",
      },
    });
    const accounting = response();
    await invoiceList(request("accountant"), accounting as any);
    assert.equal(accounting.statusCode, 200);
    assert.equal(
      accounting.body.invoices.find(
        (i: any) => i.id === "invoice_orders_native",
      ).source_id,
      id,
    );
    const noFinance = response();
    await invoiceList(request("production"), noFinance as any);
    assert.equal(noFinance.statusCode, 403);
    checks.push(
      "new native order invoice draft persists for accountant and remains unavailable to production",
    );
    const { result: customProducts } = await createProductsWorkflow(
      container,
    ).run({
      input: {
        products: [{ title: "Isolated bespoke QA", status: "published" }],
      },
    });
    const customProduct = customProducts[0];
    const rawCustomClass = await (
      container.resolve(PRODUCT_EXTENSION_MODULE) as any
    ).createProductClassifications({ product_type: "BESPOKE" });
    const customClass = Array.isArray(rawCustomClass)
      ? rawCustomClass[0]
      : rawCustomClass;
    await (container.resolve("link") as any).create({
      [Modules.PRODUCT]: { product_id: customProduct.id },
      [PRODUCT_EXTENSION_MODULE]: { product_classification_id: customClass.id },
    });
    const customSource = await send("god", {
      type: "request.create",
      id: "request_bespoke_native",
      personId: "person_orders_native",
      title: "Isolated bespoke source",
    });
    const custom = await send("god", {
      type: "order.create",
      order: {
        requestId: "request_bespoke_native",
        expectedUpdatedAt: new Date(
          customSource.result.bespoke_request.updated_at,
        ).toISOString(),
        notes: "Isolated agreed specification",
        lines: [
          {
            productId: customProduct.id,
            variantId: null,
            quantity: 1,
            unitPriceMinor: 54321,
            quoteConfirmed: true,
          },
        ],
      },
    });
    const customList = response();
    await list(request("god"), customList as any);
    assert.equal(customList.statusCode, 200);
    const customOrder = customList.body.orders.find(
      (o: any) => o.id === custom.result.order.id,
    );
    assert.ok(customOrder);
    assert.equal(customOrder.items[0].variant_id ?? null, null);
    assert.equal(Number(customOrder.items[0].unit_price), 543.21);
    const nativeCustom = await (
      container.resolve(Modules.ORDER) as any
    ).retrieveOrder(customOrder.id, { relations: ["items"] });
    assert.equal(nativeCustom.items[0].requires_shipping, true);
    assert.equal(
      nativeCustom.items[0].metadata.agreed_specification,
      "Isolated agreed specification",
    );
    checks.push(
      "native bespoke order preserves agreed price/specification without inventing a variant",
    );
  } catch (error) {
    primaryError = error;
    console.error("OS_ORDERS_NATIVE_FAILURE", error);
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const user of Object.values(staff) as any[])
      try {
        await users.updateUsers({
          id: user.id,
          metadata: {
            woodright_access: {
              role: user.metadata.woodright_access.role,
              enabled: false,
              version: 2,
            },
          },
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    if (oldFiles === undefined) delete process.env.WOODRIGHT_PRIVATE_FILES_ROOT;
    else process.env.WOODRIGHT_PRIVATE_FILES_ROOT = oldFiles;
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      if (primaryError)
        console.error("OS_ORDERS_NATIVE_CLEANUP_FAILURE", cleanupErrors);
      else
        throw new AggregateError(
          cleanupErrors,
          "Isolated order QA cleanup failed",
        );
    }
  }
  console.log(
    "OS_ORDERS_NATIVE_PASS",
    JSON.stringify({
      checks,
      syntheticOnly: true,
      publicData: false,
      temporaryRolesDisabled: true,
      temporaryFilesRemoved: true,
    }),
  );
}
