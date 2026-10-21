import {
  audit,
  DeskError,
  entity,
  identifier,
  operation,
  requireEntity,
  type EntityType,
  type Sql,
} from "./commands";

function text(value: unknown, max: number, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new DeskError(
      400,
      "INVALID_COMPANY",
      "Проверьте заполнение и длину полей компании",
    );
  return value.trim();
}
function company(raw: unknown) {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw new DeskError(400, "INVALID_COMPANY", "Заполните компанию");
  const result = {
    name: text(p.name, 200, true),
    legal_name: text(p.legalName ?? "", 300),
    tax_id: text(p.taxId ?? "", 12),
    kpp: text(p.kpp ?? "", 9),
    email: text(p.email ?? "", 254).toLowerCase(),
    phone: text(p.phone ?? "", 80),
    address: text(p.address ?? "", 1000),
    notes: text(p.notes ?? "", 10000),
    status: p.status ?? "active",
  };
  if (
    (result.tax_id && !/^\d{10}(\d{2})?$/.test(result.tax_id)) ||
    (result.kpp && !/^\d{9}$/.test(result.kpp))
  )
    throw new DeskError(
      400,
      "INVALID_TAX_ID",
      "ИНН: 10 или 12 цифр. КПП: 9 цифр.",
    );
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new DeskError(400, "INVALID_EMAIL", "Проверьте email компании");
  if (
    result.phone &&
    (!/^[+\d\s().-]+$/.test(result.phone) ||
      result.phone.replace(/\D/g, "").length < 7)
  )
    throw new DeskError(400, "INVALID_PHONE", "Проверьте телефон компании");
  if (!["active", "archived"].includes(String(result.status)))
    throw new DeskError(400, "INVALID_STATUS", "Проверьте статус компании");
  return result;
}
export async function teamInstalled(sql: Sql) {
  const row = (
    await sql.raw(
      "select to_regclass('woodright_company') as company, to_regclass('woodright_desk_record') as record",
    )
  ).rows[0];
  return Boolean(row?.company && row?.record);
}
export async function requireStaff(sql: Sql, id: unknown) {
  const value = identifier(id);
  if (
    !(
      await sql.raw(
        'select id from "user" where id = ? and deleted_at is null for share',
        [value],
      )
    ).rows.length
  )
    throw new DeskError(
      400,
      "INVALID_ASSIGNEE",
      "Сотрудник больше не доступен. Обновите список.",
    );
  return value;
}
export async function saveRecord(
  trx: Sql,
  actor: string,
  type: EntityType,
  id: string,
  input: any,
  expected: number,
) {
  if (!Number.isSafeInteger(expected) || expected < 0)
    throw new DeskError(
      428,
      "VERSION_REQUIRED",
      "Обновите назначение перед сохранением",
    );
  if (!input || typeof input !== "object")
    throw new DeskError(400, "INVALID_ASSIGNMENT", "Проверьте назначение");
  const companyId =
    input.companyId === null || input.companyId === ""
      ? null
      : identifier(input.companyId);
  const assigneeId =
    input.assigneeId === null || input.assigneeId === ""
      ? null
      : await requireStaff(trx, input.assigneeId);
  await requireEntity(trx, type, id);
  await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [
    `desk-record:${type}:${id}`,
  ]);
  const old = (
    await trx.raw(
      "select * from woodright_desk_record where entity_type = ? and entity_id = ? for update",
      [type, id],
    )
  ).rows[0];
  if ((old?.version ?? 0) !== expected)
    throw new DeskError(
      409,
      "STALE_VERSION",
      "Коллега изменил компанию или ответственного. Сверьте новую версию.",
    );
  if (type === "company" && companyId)
    throw new DeskError(
      400,
      "INVALID_COMPANY_LINK",
      "Компания не может быть вложена в другую компанию",
    );
  if (companyId) {
    const row = (
      await trx.raw(
        "select status from woodright_company where id = ? and deleted_at is null for share",
        [companyId],
      )
    ).rows[0];
    if (!row || (row.status !== "active" && old?.company_id !== companyId))
      throw new DeskError(
        400,
        "COMPANY_UNAVAILABLE",
        "Выберите действующую компанию",
      );
  }
  const record = (
    await trx.raw(
      `insert into woodright_desk_record(entity_type,entity_id,company_id,assignee_id) values(?,?,?,?)
    on conflict(entity_type,entity_id) do update set company_id=excluded.company_id, assignee_id=excluded.assignee_id,
    version=woodright_desk_record.version+1, updated_at=now() returning *`,
      [type, id, companyId, assigneeId],
    )
  ).rows[0];
  await audit(trx, actor, type, id, "record.assigned", {
    from_company_id: old?.company_id ?? null,
    company_id: companyId,
    from_assignee_id: old?.assignee_id ?? null,
    assignee_id: assigneeId,
  });
  return record;
}
export async function executeTeamCommand(
  sql: Sql,
  actor: string,
  c: Record<string, any>,
) {
  if (!(await teamInstalled(sql)))
    throw new DeskError(
      503,
      "TEAM_SCHEMA_REQUIRED",
      "Компании и назначения ещё не установлены",
    );
  const id = identifier(c.id);
  if (c.type === "record.update") {
    const type = entity(c.entityType);
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        entityType: type,
        ownership: c.ownership,
        expected: c.expectedVersion,
      },
      async (trx) => ({
        record: await saveRecord(
          trx,
          actor,
          type,
          id,
          c.ownership,
          c.expectedVersion,
        ),
      }),
    );
  }
  if (!["company.create", "company.update"].includes(c.type))
    throw new DeskError(
      400,
      "UNKNOWN_COMMAND",
      "Неизвестное действие компании",
    );
  const fields = company(c.company);
  if (
    c.type === "company.update" &&
    (!Number.isSafeInteger(c.expectedVersion) || c.expectedVersion < 1)
  )
    throw new DeskError(428, "VERSION_REQUIRED", "Обновите карточку компании");
  return operation(
    sql,
    actor,
    c.key,
    {
      type: c.type,
      id,
      company: fields,
      ...(c.type === "company.update" ? { expected: c.expectedVersion } : {}),
    },
    async (trx) => {
      let saved;
      if (c.type === "company.create") {
        saved = (
          await trx.raw(
            `insert into woodright_company(id,name,legal_name,tax_id,kpp,email,phone,address,notes,status)
        values(?,?,?,?,?,?,?,?,?,?) returning *`,
            [id, ...Object.values(fields)],
          )
        ).rows[0];
      } else {
        saved = (
          await trx.raw(
            `update woodright_company set name=?,legal_name=?,tax_id=?,kpp=?,email=?,phone=?,address=?,notes=?,status=?,version=version+1,updated_at=now()
        where id=? and version=? and deleted_at is null returning *`,
            [...Object.values(fields), id, c.expectedVersion],
          )
        ).rows[0];
        if (!saved)
          throw new DeskError(
            409,
            "STALE_VERSION",
            "Компания изменилась. Сверьте новую версию перед сохранением.",
          );
      }
      await audit(
        trx,
        actor,
        "company",
        id,
        c.type === "company.create" ? "company.created" : "company.updated",
        { status: fields.status },
      );
      return { company: saved };
    },
  );
}
