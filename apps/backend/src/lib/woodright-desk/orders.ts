import { createHash } from "node:crypto";
import { audit, DeskError, identifier, operation, type Sql } from "./commands";
import { saveRecord } from "./team";

const fail = (message: string, status = 400) => {
  throw new DeskError(status, "ORDER_INVALID", message);
};
export function orderInput(raw: any) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).some(
      (k) => !["requestId", "lines", "notes", "expectedUpdatedAt"].includes(k),
    )
  )
    fail("Проверьте данные заказа");
  const requestId = identifier(raw.requestId);
  if (
    typeof raw.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.expectedUpdatedAt))
  )
    fail("Обновите обращение перед созданием заказа", 428);
  if (typeof raw.notes !== "string" || raw.notes.length > 10000)
    fail("Заметка не должна превышать 10 000 символов");
  if (!Array.isArray(raw.lines) || !raw.lines.length || raw.lines.length > 100)
    fail("Добавьте от 1 до 100 позиций");
  const seen = new Set<string>();
  const lines = raw.lines.map((l: any) => {
    if (
      !l ||
      typeof l !== "object" ||
      Object.keys(l).some(
        (k) =>
          ![
            "productId",
            "variantId",
            "quantity",
            "unitPriceMinor",
            "quoteConfirmed",
          ].includes(k),
      )
    )
      fail("Проверьте позицию");
    const productId = identifier(l.productId);
    const variantId = l.variantId ? identifier(l.variantId) : null;
    const identity = `${productId}:${variantId || ""}`;
    if (seen.has(identity))
      fail("Объедините одинаковые варианты в одну позицию");
    seen.add(identity);
    if (
      !Number.isSafeInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > 10000 ||
      !Number.isSafeInteger(l.unitPriceMinor) ||
      l.unitPriceMinor <= 0 ||
      l.unitPriceMinor > 9000000000000
    )
      fail("Проверьте количество и цену");
    return {
      productId,
      variantId,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      quoteConfirmed: l.quoteConfirmed === true,
    };
  });
  if (
    lines.reduce((n: number, l: any) => n + l.quantity * l.unitPriceMinor, 0) >
    9000000000000
  )
    fail("Превышена допустимая сумма заказа");
  return {
    requestId,
    expectedUpdatedAt: raw.expectedUpdatedAt,
    notes: raw.notes.trim(),
    lines,
  };
}

export type OrderPorts = {
  products: () => Promise<any[]>;
  find: (id: string) => Promise<any | null>;
  create: (input: any) => Promise<any>;
};

/** Native Medusa owns the order and its items. A request has one deterministic order ID.
 * The native workflow commits independently: metadata is a durable recovery receipt if
 * the following desk transaction fails. Retrying repairs links, never creates another order.
 * No payment, stock reservation, shipment or customer notification is manufactured here.
 */
export async function createOrderFromRequest(
  sql: Sql,
  actor: string,
  command: any,
  ports: OrderPorts,
) {
  const input = orderInput(command.order);
  const id = `order_wr_${createHash("sha256").update(input.requestId).digest("hex").slice(0, 40)}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return operation(
    sql,
    actor,
    command.key,
    { type: "order.create", input },
    async (trx) => {
      await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [
        `desk-order:${input.requestId}`,
      ]);
      const request = (
        await trx.raw(
          "select * from bespoke_request where id=? and deleted_at is null for update",
          [input.requestId],
        )
      ).rows[0];
      if (!request) fail("Обращение не найдено", 404);
      const ownership = (
        await trx.raw(
          "select * from woodright_desk_record where entity_type='request' and entity_id=? for share",
          [input.requestId],
        )
      ).rows[0];
      let order = await ports.find(id);
      const existing = order?.metadata?.woodright_os;
      if (
        order &&
        (existing?.request_id !== input.requestId ||
          existing?.fingerprint !== fingerprint)
      ) {
        throw new DeskError(
          409,
          "ORDER_EXISTS",
          "Из обращения уже создан заказ. Обновите данные и откройте его.",
        );
      }
      if (!order) {
        if (
          new Date(request.updated_at).toISOString() !==
          new Date(input.expectedUpdatedAt).toISOString()
        )
          fail(
            "Коллега изменил обращение. Обновите данные и сверьте заказ",
            409,
          );
        const products = await ports.products();
        const items = input.lines.map((line: any) => {
          const product = products.find((p) => p.id === line.productId);
          const variant = product?.variants.find(
            (v: any) => v.id === line.variantId,
          );
          if (!product || product.status !== "published")
            fail("Выберите опубликованный товар");
          if (product.classification === "BESPOKE") {
            if (
              !line.quoteConfirmed ||
              !input.notes ||
              (line.variantId && !variant)
            )
              fail(
                "Подтвердите согласованную цену и опишите спецификацию изделия по проекту",
              );
            return {
              ...(variant
                ? { variant_id: variant.id }
                : {
                    product_id: product.id,
                    title: product.title,
                    product_title: product.title,
                  }),
              quantity: line.quantity,
              unit_price: line.unitPriceMinor / 100,
              requires_shipping: true,
              is_discountable: false,
              metadata: {
                woodright_request_id: input.requestId,
                agreed_specification: input.notes,
                quote_confirmed_by: actor,
              },
            };
          }
          if (
            !["STANDARD", "CONFIGURABLE"].includes(product.classification) ||
            !variant
          )
            fail("Выберите существующий вариант изделия");
          const minor = Math.round(Number(variant.rub_price?.amount) * 100);
          if (
            !Number.isSafeInteger(minor) ||
            minor <= 0 ||
            minor !== line.unitPriceMinor
          )
            fail(
              "Цена варианта изменилась или недоступна. Обновите каталог и сверьте заказ",
              409,
            );
          return {
            variant_id: line.variantId,
            quantity: line.quantity,
            unit_price: minor / 100,
            is_discountable: false,
          };
        });
        const person = request.lead_id
          ? (
              await trx.raw(
                "select id,name,email from lead where id=? and deleted_at is null for share",
                [request.lead_id],
              )
            ).rows[0]
          : null;
        const snapshot = {
          request_id: input.requestId,
          person_id: person?.id || null,
          customer_name: person?.name || null,
          company_id: ownership?.company_id || null,
          assignee_id: ownership?.assignee_id || null,
          fingerprint,
          creation_input: input,
          notes: input.notes,
          created_by: actor,
        };
        order = await ports.create({
          id,
          status: "draft",
          is_draft_order: true,
          currency_code: "rub",
          ...(person?.email ? { email: person.email } : {}),
          no_notification: true,
          items,
          metadata: { woodright_os: snapshot },
        });
        if (order?.id !== id)
          throw new DeskError(
            503,
            "ORDER_ID_CONTRACT",
            "Не удалось подтвердить номер заказа. Не повторяйте создание, обратитесь к администратору",
          );
      }
      const record = (
        await trx.raw(
          "select * from woodright_desk_record where entity_type='order' and entity_id=? for update",
          [id],
        )
      ).rows[0];
      if (!record) {
        await saveRecord(
          trx,
          actor,
          "order",
          id,
          {
            companyId: ownership?.company_id || null,
            assigneeId: ownership?.assignee_id || null,
          },
          0,
        );
        await audit(trx, actor, "order", id, "order.created_from_request", {
          requestId: input.requestId,
        });
      }
      return {
        order: { id, display_id: order.display_id },
        recovered: Boolean(existing),
      };
    },
  );
}
