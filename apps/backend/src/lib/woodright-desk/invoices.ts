import {
  audit,
  dateOnly,
  DeskError,
  identifier,
  operation,
  requireEntity,
  type Sql,
} from "./commands";
import { createHash } from "node:crypto";
import { PrivateFileStore } from "./private-files";

const MAX_TOTAL = 9_000_000_000_000;
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new DeskError(
      400,
      "INVALID_INVOICE",
      "Проверьте заполнение счёта и длину полей",
    );
  return value.trim();
}
function knownKeys(value: any, allowed: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new DeskError(
      400,
      "INVALID_INVOICE",
      "В форме счёта есть неподдерживаемые поля",
    );
}
export function invoiceFields(raw: unknown) {
  const p = raw as any;
  knownKeys(p, [
    "sourceType",
    "sourceId",
    "companyId",
    "payer",
    "lines",
    "notes",
  ]);
  if (!["request", "order"].includes(p.sourceType))
    throw new DeskError(
      400,
      "INVOICE_SOURCE_REQUIRED",
      "Выберите обращение или заказ",
    );
  const sourceId = identifier(p.sourceId);
  const companyId = p.companyId ? identifier(p.companyId) : null;
  knownKeys(p.payer, ["type", "name", "inn", "kpp", "address"]);
  const payer = {
    type: p.payer.type,
    name: text(p.payer.name, 300, true),
    inn: text(p.payer.inn ?? "", 12),
    kpp: text(p.payer.kpp ?? "", 9),
    address: text(p.payer.address ?? "", 1000),
  };
  if (
    !["person", "company", "entrepreneur"].includes(payer.type) ||
    (payer.type === "company" && !/^\d{10}$/.test(payer.inn)) ||
    (payer.type === "entrepreneur" && !/^\d{12}$/.test(payer.inn)) ||
    (payer.type === "person" && payer.inn && !/^\d{12}$/.test(payer.inn)) ||
    (payer.kpp && !/^\d{9}$/.test(payer.kpp))
  )
    throw new DeskError(
      400,
      "INVALID_PAYER",
      "Проверьте плательщика, ИНН и КПП",
    );
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 200)
    throw new DeskError(
      400,
      "INVOICE_LINES_REQUIRED",
      "Добавьте от 1 до 200 позиций",
    );
  let total = 0n;
  const lines = p.lines.map((l: any) => {
    knownKeys(l, ["name", "quantity", "unitPriceMinor", "variantId"]);
    const quantity = text(l.quantity, 15, true);
    if (
      !/^\d{1,9}(\.\d{1,3})?$/.test(quantity) ||
      !Number.isSafeInteger(l.unitPriceMinor) ||
      l.unitPriceMinor < 0 ||
      l.unitPriceMinor > MAX_TOTAL
    )
      throw new DeskError(
        400,
        "INVALID_INVOICE_LINE",
        "Проверьте количество и цену позиции",
      );
    const [whole, decimal = ""] = quantity.split(".");
    const thousandths = BigInt(whole) * 1000n + BigInt(decimal.padEnd(3, "0"));
    if (thousandths <= 0n)
      throw new DeskError(
        400,
        "INVALID_INVOICE_LINE",
        "Количество должно быть больше нуля",
      );
    const lineTotal = (BigInt(l.unitPriceMinor) * thousandths + 500n) / 1000n;
    total += lineTotal;
    if (total > BigInt(MAX_TOTAL))
      throw new DeskError(
        400,
        "INVOICE_AMOUNT_LIMIT",
        "Сумма счёта превышает допустимый предел",
      );
    return {
      name: text(l.name, 500, true),
      quantity,
      unitPriceMinor: l.unitPriceMinor,
      totalMinor: Number(lineTotal),
      variantId: l.variantId ? identifier(l.variantId) : null,
    };
  });
  return {
    sourceType: p.sourceType as "request" | "order",
    sourceId,
    companyId,
    payer,
    lines,
    totalMinor: Number(total),
    notes: text(p.notes ?? "", 10000),
  };
}
export async function invoicesInstalled(sql: Sql) {
  const r = (
    await sql.raw("select to_regclass('woodright_invoice') as invoice")
  ).rows[0];
  return Boolean(r?.invoice);
}
async function currentInvoice(sql: Sql, id: string, version: unknown) {
  if (!Number.isSafeInteger(version) || Number(version) < 1)
    throw new DeskError(
      428,
      "VERSION_REQUIRED",
      "Обновите счёт перед сохранением",
    );
  const row = (
    await sql.raw(
      "select * from woodright_invoice where id=? and deleted_at is null for update",
      [id],
    )
  ).rows[0];
  if (!row) throw new DeskError(404, "INVOICE_NOT_FOUND", "Счёт не найден");
  if (row.version !== version)
    throw new DeskError(
      409,
      "STALE_VERSION",
      "Коллега изменил счёт. Сверьте новую версию; ваш черновик сохранён в форме",
    );
  return row;
}
export async function executeInvoiceCommand(
  sql: Sql,
  actor: string,
  c: Record<string, any>,
) {
  if (!(await invoicesInstalled(sql)))
    throw new DeskError(
      503,
      "INVOICE_SCHEMA_REQUIRED",
      "Раздел счетов ещё не установлен в базе",
    );
  const id = identifier(c.id);
  if (["invoice.create", "invoice.update"].includes(c.type)) {
    const f = invoiceFields(c.invoice);
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        invoice: f,
        ...(c.type === "invoice.update" ? { expected: c.expectedVersion } : {}),
      },
      async (trx) => {
        const old =
          c.type === "invoice.update"
            ? await currentInvoice(trx, id, c.expectedVersion)
            : null;
        if (old && old.status !== "draft")
          throw new DeskError(
            409,
            "INVOICE_IMMUTABLE",
            "Реквизиты зарегистрированного или архивного счёта менять нельзя",
          );
        await requireEntity(trx, f.sourceType, f.sourceId);
        if (f.companyId) {
          const company = (
            await trx.raw(
              "select status from woodright_company where id=? and deleted_at is null for share",
              [f.companyId],
            )
          ).rows[0];
          if (
            !company ||
            (company.status !== "active" && old?.company_id !== f.companyId)
          )
            throw new DeskError(
              400,
              "COMPANY_UNAVAILABLE",
              "Выберите действующую компанию",
            );
        }
        for (const line of f.lines)
          if (line.variantId) {
            const variant = (
              await trx.raw(
                "select id from product_variant where id=? and deleted_at is null for share",
                [line.variantId],
              )
            ).rows[0];
            if (!variant)
              throw new DeskError(
                400,
                "INVOICE_VARIANT_MISSING",
                "Вариант товара больше не доступен. Проверьте позицию",
              );
          }
        const values = [
          f.sourceType,
          f.sourceId,
          f.companyId,
          JSON.stringify(f.payer),
          JSON.stringify(f.lines),
          f.totalMinor,
          f.notes,
        ];
        const invoice = old
          ? (
              await trx.raw(
                "update woodright_invoice set source_type=?,source_id=?,company_id=?,payer=?::jsonb,lines=?::jsonb,total_minor=?,notes=?,version=version+1,updated_at=now() where id=? returning *",
                [...values, id],
              )
            ).rows[0]
          : (
              await trx.raw(
                "insert into woodright_invoice(id,source_type,source_id,company_id,payer,lines,total_minor,notes,created_by) values(?,?,?,?,?::jsonb,?::jsonb,?,?,?) on conflict(id) do nothing returning *",
                [id, ...values, actor],
              )
            ).rows[0];
        if (!invoice)
          throw new DeskError(
            409,
            "INVOICE_EXISTS",
            "Черновик уже сохранён. Откройте текущую запись из общей базы",
          );
        await audit(
          trx,
          actor,
          "invoice",
          id,
          old ? "invoice.updated" : "invoice.created",
          {
            source_type: f.sourceType,
            source_id: f.sourceId,
            total_minor: f.totalMinor,
          },
        );
        return { invoice };
      },
    );
  }
  if (c.type === "invoice.register") {
    const number = text(c.number, 100, true),
      documentDate = dateOnly(c.documentDate);
    const reference = text(c.accountingRef ?? "", 200) || null,
      attachmentId = identifier(c.attachmentId);
    if (
      c.confirmedFrom1C !== true ||
      !Number.isSafeInteger(c.documentTotalMinor) ||
      c.documentTotalMinor < 0
    )
      throw new DeskError(
        400,
        "ACCOUNTING_DOCUMENT_REQUIRED",
        "Подтвердите номер, дату и сумму из реального счёта 1С",
      );
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        number,
        documentDate,
        reference,
        attachmentId,
        total: c.documentTotalMinor,
        expected: c.expectedVersion,
      },
      async (trx) => {
        const old = await currentInvoice(trx, id, c.expectedVersion);
        if (old.status !== "draft")
          throw new DeskError(
            409,
            "INVOICE_IMMUTABLE",
            "Этот счёт уже зарегистрирован или находится в архиве",
          );
        if (Number(old.total_minor) !== c.documentTotalMinor)
          throw new DeskError(
            409,
            "ACCOUNTING_TOTAL_MISMATCH",
            "Сумма документа отличается от черновика. Сначала сверьте позиции",
          );
        const file = (
          await trx.raw(
            "select * from woodright_private_attachment where id=? and entity_type='invoice' and entity_id=? and deleted_at is null for share",
            [attachmentId, id],
          )
        ).rows[0];
        if (!file || file.visibility !== "business")
          throw new DeskError(
            400,
            "INVOICE_PDF_REQUIRED",
            "Прикрепите PDF к этому счёту",
          );
        const bytes = await new PrivateFileStore(
          process.env.WOODRIGHT_PRIVATE_FILES_ROOT || "",
        ).get(file.storage_key);
        if (
          bytes.length !== file.size ||
          createHash("sha256").update(bytes).digest("hex") !== file.sha256
        )
          throw new DeskError(
            503,
            "FILE_INTEGRITY",
            "Не удалось подтвердить целостность PDF",
          );
        if (
          !/\.pdf$/i.test(file.filename) ||
          bytes.subarray(0, 5).toString() !== "%PDF-"
        )
          throw new DeskError(
            400,
            "INVOICE_PDF_REQUIRED",
            "Выберите документ в формате PDF",
          );
        await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [
          `invoice-number:${documentDate}:${number}`,
        ]);
        const duplicate = (
          await trx.raw(
            "select id from woodright_invoice where (accounting_number=? and accounting_date=?::date) or (?::text is not null and accounting_ref=?) or pdf_attachment_id=?",
            [number, documentDate, reference, reference, attachmentId],
          )
        ).rows[0];
        if (duplicate)
          throw new DeskError(
            409,
            "ACCOUNTING_DOCUMENT_EXISTS",
            "Такой документ уже зарегистрирован. Найдите существующий счёт",
          );
        let invoice;
        try {
          invoice = (
            await trx.raw(
              "update woodright_invoice set status='registered',accounting_number=?,accounting_date=?::date,accounting_ref=?,pdf_attachment_id=?,registration_source='manual_1c',registered_by=?,registered_at=now(),version=version+1,updated_at=now() where id=? returning *",
              [number, documentDate, reference, attachmentId, actor, id],
            )
          ).rows[0];
        } catch (e: any) {
          if (e.code === "23505")
            throw new DeskError(
              409,
              "ACCOUNTING_DOCUMENT_EXISTS",
              "Такой документ уже зарегистрирован",
            );
          throw e;
        }
        await audit(trx, actor, "invoice", id, "invoice.registered", {
          source: "manual_1c",
          number,
          document_date: documentDate,
          attachment_id: attachmentId,
          total_minor: c.documentTotalMinor,
        });
        return { invoice };
      },
    );
  }
  if (c.type === "invoice.archive") {
    if (typeof c.archived !== "boolean")
      throw new DeskError(
        400,
        "INVALID_INVOICE_STATUS",
        "Выберите действие с архивом",
      );
    return operation(
      sql,
      actor,
      c.key,
      { type: c.type, id, archived: c.archived, expected: c.expectedVersion },
      async (trx) => {
        const old = await currentInvoice(trx, id, c.expectedVersion);
        const status = c.archived
          ? "archived"
          : old.accounting_number
            ? "registered"
            : "draft";
        const invoice = (
          await trx.raw(
            "update woodright_invoice set status=?,version=version+1,updated_at=now() where id=? returning *",
            [status, id],
          )
        ).rows[0];
        await audit(
          trx,
          actor,
          "invoice",
          id,
          c.archived ? "invoice.archived" : "invoice.restored",
          {},
        );
        return { invoice };
      },
    );
  }
  throw new DeskError(
    400,
    "UNKNOWN_COMMAND",
    "Действие со счётом не поддерживается",
  );
}
