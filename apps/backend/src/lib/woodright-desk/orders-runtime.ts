import { createOrderWorkflow } from "@medusajs/medusa/core-flows";
import { DeskError, type Sql } from "./commands";
import type { OrderPorts } from "./orders";
import { orderBasePrice } from "./orders-pricing";

export async function orderCatalog(scope: any) {
  const query = scope.resolve("query"),
    products: any[] = [];
  for (let skip = 0; ; skip += 100) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "status",
        "product_classification.product_type",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.price_set.prices.id",
        "variants.price_set.prices.amount",
        "variants.price_set.prices.currency_code",
        "variants.price_set.prices.price_list_id",
        "variants.price_set.prices.min_quantity",
        "variants.price_set.prices.max_quantity",
        "variants.price_set.prices.rules_count",
        "variants.price_set.prices.price_rules.id",
      ],
      pagination: { take: 100, skip },
    });
    for (const p of data)
      products.push({
        id: p.id,
        title: p.title,
        status: p.status,
        classification: p.product_classification?.product_type || "UNKNOWN",
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          rub_price: orderBasePrice(v.price_set?.prices || []),
        })),
      });
    if (data.length < 100) break;
  }
  return products;
}

export function orderPorts(scope: any, trx: Sql): OrderPorts {
  const query = scope.resolve("query");
  return {
    products: () => orderCatalog(scope),
    find: async (id) =>
      (
        await trx.raw(
          'select id,display_id,metadata from "order" where id=? and deleted_at is null',
          [id],
        )
      ).rows[0] || null,
    create: async (input) => {
      const regions = (
        await query.graph({
          entity: "region",
          fields: ["id", "currency_code"],
          filters: { currency_code: "rub" },
        })
      ).data;
      if (regions.length !== 1)
        throw new DeskError(
          409,
          "ORDER_REGION_REQUIRED",
          "Администратору нужно проверить регион продаж в рублях",
        );
      const { result } = await createOrderWorkflow(scope).run({
        input: { ...input, region_id: regions[0].id },
      });
      return result;
    },
  };
}
