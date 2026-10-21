import { createHash, randomUUID } from "node:crypto";
import { executeTeamCommand, requireStaff, saveRecord } from "./team";

export type Sql = {
  raw: (
    query: string,
    bindings?: unknown[],
  ) => Promise<{ rows: Record<string, any>[] }>;
  transaction: <T>(work: (trx: Sql) => Promise<T>) => Promise<T>;
};
export class DeskError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const ENTITY_TABLES = {
  person: "lead",
  request: "bespoke_request",
  order: "order",
  company: "woodright_company",
} as const;
export type EntityType = keyof typeof ENTITY_TABLES;
export function entity(value: unknown): EntityType {
  if (typeof value !== "string" || !Object.hasOwn(ENTITY_TABLES, value))
    throw new DeskError(
      400,
      "INVALID_ENTITY",
      "Выберите клиента, обращение или заказ",
    );
  return value as EntityType;
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value))
    throw new DeskError(400, "INVALID_ID", "Некорректный идентификатор");
  return value;
}
export function dateOnly(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new DeskError(400, "INVALID_DATE", "Укажите корректную дату");
  return value;
}
function boundedText(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new DeskError(400, "INVALID_TEXT", "Проверьте текст и его длину");
  return value;
}
function contact(raw: unknown) {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object")
    throw new DeskError(400, "CONTACT_REQUIRED", "Заполните контакт клиента");
  const name = boundedText(p.name, 200, true).trim();
  const email = boundedText(p.email ?? "", 254)
    .trim()
    .toLowerCase();
  const phone = boundedText(p.phone ?? "", 80).trim();
  const comment = boundedText(p.comment ?? "", 10000).trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new DeskError(400, "INVALID_EMAIL", "Проверьте email клиента");
  if (
    phone &&
    (!/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7)
  )
    throw new DeskError(400, "INVALID_PHONE", "Проверьте телефон клиента");
  return { name, email, phone, comment };
}
async function insertPerson(
  trx: Sql,
  actor: string,
  id: string,
  p: ReturnType<typeof contact>,
) {
  const person = (
    await trx.raw(
      `insert into lead (id, source, name, email, phone, comment, payload, status)
    values (?, 'contact', ?, ?, ?, ?, ?::jsonb, 'new') returning *`,
      [
        id,
        p.name,
        p.email || null,
        p.phone || null,
        p.comment || null,
        JSON.stringify({ origin: "woodright_os", created_by: actor }),
      ],
    )
  ).rows[0];
  await audit(trx, actor, "person", id, "person.created", {});
  return person;
}
export async function requireEntity(sql: Sql, type: EntityType, id: string) {
  const { rows } = await sql.raw(
    `select id from "${ENTITY_TABLES[type]}" where id = ? and deleted_at is null for share`,
    [id],
  );
  if (!rows.length)
    throw new DeskError(
      404,
      "ENTITY_NOT_FOUND",
      "Связанная карточка не найдена",
    );
}
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
/** Mutation, receipt, and audit commit together. Lost responses can be replayed with the same key. */
export async function operation(
  sql: Sql,
  actorId: string,
  key: unknown,
  input: object,
  work: (trx: Sql) => Promise<Record<string, unknown>>,
) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
    throw new DeskError(
      400,
      "OPERATION_KEY_REQUIRED",
      "Обновите форму перед сохранением",
    );
  const id = createHash("sha256").update(`${actorId}:${key}`).digest("hex");
  const fingerprint = createHash("sha256")
    .update(canonical(input))
    .digest("hex");
  return sql.transaction(async (trx) => {
    await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [id]);
    const old = (
      await trx.raw(
        "select fingerprint, result from woodright_desk_operation where id = ?",
        [id],
      )
    ).rows[0];
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw new DeskError(
          409,
          "KEY_REUSED",
          "Этот ключ уже использован для другого действия",
        );
      return { ...old.result, replay: true };
    }
    const result = await work(trx);
    await trx.raw(
      `insert into woodright_desk_operation (id, actor_id, fingerprint, result) values (?, ?, ?, ?::jsonb)`,
      [id, actorId, fingerprint, JSON.stringify(result)],
    );
    return result;
  });
}
export async function audit(
  sql: Sql,
  actor: string,
  type: string,
  id: string,
  action: string,
  details: object,
) {
  await sql.raw(
    `insert into woodright_desk_event (id, actor_id, entity_type, entity_id, action, details)
    values (?, ?, ?, ?, ?, ?::jsonb)`,
    [`wde_${randomUUID()}`, actor, type, id, action, JSON.stringify(details)],
  );
}
export async function executeDeskCommand(
  sql: Sql,
  actor: string,
  raw: unknown,
) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new DeskError(400, "INVALID_BODY", "Проверьте форму");
  const c = raw as Record<string, any>;
  const id = identifier(c.id);
  if (["company.create", "company.update", "record.update"].includes(c.type))
    return executeTeamCommand(sql, actor, c);
  if (c.type === "person.create") {
    const person = contact(c.person);
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        person,
        ...(c.ownership ? { ownership: c.ownership } : {}),
      },
      async (trx) => {
        const person = await insertPerson(trx, actor, id, contact(c.person));
        if (c.ownership)
          await saveRecord(trx, actor, "person", id, c.ownership, 0);
        return { person };
      },
    );
  }
  if (c.type === "person.update") {
    const person = contact(c.person);
    if (
      typeof c.expectedUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(c.expectedUpdatedAt))
    )
      throw new DeskError(
        428,
        "VERSION_REQUIRED",
        "Обновите карточку перед сохранением",
      );
    return operation(
      sql,
      actor,
      c.key,
      { type: c.type, id, person, expected: c.expectedUpdatedAt },
      async (trx) => {
        const current = (
          await trx.raw(
            "select * from lead where id = ? and deleted_at is null for update",
            [id],
          )
        ).rows[0];
        if (!current) throw new DeskError(404, "NOT_FOUND", "Клиент не найден");
        if (
          new Date(current.updated_at).toISOString() !==
          new Date(c.expectedUpdatedAt).toISOString()
        )
          throw new DeskError(
            409,
            "STALE_VERSION",
            "Коллега изменил контакт. Сверьте новую версию перед сохранением",
          );
        const updated = (
          await trx.raw(
            `update lead set name = ?, email = ?, phone = ?, comment = ?,
        updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')
        where id = ? returning *`,
            [
              person.name,
              person.email || null,
              person.phone || null,
              person.comment || null,
              id,
            ],
          )
        ).rows[0];
        await audit(trx, actor, "person", id, "person.updated", {
          fields: ["name", "email", "phone", "comment"].filter(
            (field) =>
              (current[field] || "") !== person[field as keyof typeof person],
          ),
        });
        return { person: updated };
      },
    );
  }
  if (c.type === "request.create") {
    const title = boundedText(c.title, 200, true).trim();
    const description = boundedText(c.description ?? "", 10000).trim();
    const dimensions = boundedText(c.dimensions ?? "", 500).trim();
    const materials = boundedText(c.materials ?? "", 2000).trim();
    const budget = boundedText(c.budget ?? "", 500).trim();
    const personId = identifier(c.personId);
    const person = c.person ? contact(c.person) : null;
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        title,
        description,
        dimensions,
        materials,
        budget,
        personId,
        person,
        ...(c.ownership ? { ownership: c.ownership } : {}),
      },
      async (trx) => {
        if (person) await insertPerson(trx, actor, personId, person);
        else await requireEntity(trx, "person", personId);
        const request = (
          await trx.raw(
            `insert into bespoke_request
        (id, lead_id, comment, dimensions, materials, budget, status)
        values (?, ?, ?, ?, ?, ?, 'new') returning *`,
            [
              id,
              personId,
              [title, description].filter(Boolean).join("\n"),
              dimensions || null,
              materials || null,
              budget || null,
            ],
          )
        ).rows[0];
        await audit(trx, actor, "request", id, "request.created", {
          person_id: personId,
        });
        if (c.ownership)
          await saveRecord(trx, actor, "request", id, c.ownership, 0);
        return { bespoke_request: request };
      },
    );
  }
  if (c.type === "request.update") {
    const allowed = [
      "new",
      "contacted",
      "quote_sent",
      "in_production",
      "completed",
    ];
    const status = c.status;
    if (!allowed.includes(status) && status !== "paid")
      throw new DeskError(400, "INVALID_STATUS", "Неизвестный статус");
    const notes = boundedText(c.notes, 20000);
    if (
      typeof c.expectedUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(c.expectedUpdatedAt))
    )
      throw new DeskError(
        428,
        "VERSION_REQUIRED",
        "Обновите карточку перед сохранением",
      );
    return operation(
      sql,
      actor,
      c.key,
      { type: c.type, id, status, notes, expected: c.expectedUpdatedAt },
      async (trx) => {
        const current = (
          await trx.raw(
            `select * from bespoke_request where id = ? and deleted_at is null for update`,
            [id],
          )
        ).rows[0];
        if (!current)
          throw new DeskError(404, "NOT_FOUND", "Обращение не найдено");
        if (
          new Date(current.updated_at).toISOString() !==
          new Date(c.expectedUpdatedAt).toISOString()
        )
          throw new DeskError(
            409,
            "STALE_VERSION",
            "Коллега изменил обращение. Обновите карточку; ваш текст остался в форме",
          );
        if (status === "paid" && current.status !== "paid")
          throw new DeskError(
            409,
            "ACCOUNTING_REQUIRED",
            "Подтверждение оплаты поступает из бухгалтерии",
          );
        const updated = (
          await trx.raw(
            `update bespoke_request set status = ?, internal_notes = ?,
        quoted_at = case when ? = 'quote_sent' and status <> 'quote_sent' then now() else quoted_at end,
        updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')
        where id = ? returning *`,
            [status, notes, status, id],
          )
        ).rows[0];
        await audit(trx, actor, "request", id, "request.updated", {
          from: current.status,
          to: status,
          notes_changed: current.internal_notes !== notes,
        });
        return { bespoke_request: updated };
      },
    );
  }
  if (c.type === "reminder.create") {
    const type = entity(c.entityType),
      target = identifier(c.entityId),
      dueOn = dateOnly(c.dueOn);
    const summary = boundedText(c.summary, 280, true).trim();
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        entityType: type,
        target,
        dueOn,
        summary,
        ...(c.assigneeId !== undefined ? { assigneeId: c.assigneeId } : {}),
      },
      async (trx) => {
        await requireEntity(trx, type, target);
        const assignee =
          c.assigneeId !== undefined
            ? await requireStaff(trx, c.assigneeId)
            : actor;
        const reminder = (
          await trx.raw(
            `insert into woodright_follow_up
        (id, entity_type, entity_id, assignee_id, due_at, summary, status, created_by)
        values (?, ?, ?, ?, ?::timestamptz, ?, 'open', ?) returning *`,
            [
              id,
              type,
              target,
              assignee,
              `${dueOn}T09:00:00+03:00`,
              summary,
              actor,
            ],
          )
        ).rows[0];
        await audit(trx, actor, type, target, "reminder.created", {
          reminder_id: id,
          due_on: dueOn,
        });
        return { reminder };
      },
    );
  }
  if (c.type === "reminder.update") {
    if (
      !["open", "done", "cancelled"].includes(c.status) ||
      !Number.isSafeInteger(c.expectedVersion) ||
      c.expectedVersion < 1
    )
      throw new DeskError(
        400,
        "INVALID_REMINDER",
        "Проверьте статус напоминания",
      );
    return operation(
      sql,
      actor,
      c.key,
      {
        type: c.type,
        id,
        status: c.status,
        version: c.expectedVersion,
        ...(c.assigneeId !== undefined ? { assigneeId: c.assigneeId } : {}),
      },
      async (trx) => {
        const assignee =
          c.assigneeId !== undefined
            ? await requireStaff(trx, c.assigneeId)
            : null;
        const row = (
          await trx.raw(
            `update woodright_follow_up set status = ?, assignee_id = case when ? then ? else assignee_id end, version = version + 1, updated_at = now()
        where id = ? and version = ? and deleted_at is null returning *`,
            [
              c.status,
              c.assigneeId !== undefined,
              assignee,
              id,
              c.expectedVersion,
            ],
          )
        ).rows[0];
        if (!row)
          throw new DeskError(
            409,
            "STALE_VERSION",
            "Напоминание изменилось. Обновите карточку",
          );
        await audit(
          trx,
          actor,
          row.entity_type,
          row.entity_id,
          "reminder.updated",
          { reminder_id: id, status: c.status, assignee_id: row.assignee_id },
        );
        return { reminder: row };
      },
    );
  }
  throw new DeskError(400, "UNKNOWN_COMMAND", "Действие не поддерживается");
}
