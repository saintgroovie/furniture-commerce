import { createHash, timingSafeEqual } from "node:crypto";
import { DeskError, type Sql } from "./commands";

export type MangoCredentials = { apiKey: string; signingKey: string };
export function mangoSignature(json: string, credentials: MangoCredentials) {
  return createHash("sha256")
    .update(credentials.apiKey + json + credentials.signingKey, "utf8")
    .digest("hex");
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function verifyMangoForm(body: unknown, credentials: MangoCredentials) {
  const form = body as Record<string, unknown>;
  if (!credentials.apiKey || !credentials.signingKey)
    throw new DeskError(503, "MANGO_NOT_CONFIGURED", "Телефония не настроена");
  if (
    !form ||
    typeof form.vpbx_api_key !== "string" ||
    typeof form.json !== "string" ||
    typeof form.sign !== "string" ||
    !/^[0-9a-f]{64}$/i.test(form.sign) ||
    Buffer.byteLength(form.json) > 100000
  )
    throw new DeskError(401, "MANGO_SIGNATURE", "Недействительная подпись");
  const keyMatches = timingSafeEqual(
    Buffer.from(digest(form.vpbx_api_key)),
    Buffer.from(digest(credentials.apiKey)),
  );
  // Sign the exact received JSON string. Reformatting before verification invalidates the signature.
  const valid = timingSafeEqual(
    Buffer.from(mangoSignature(form.json, credentials), "hex"),
    Buffer.from(form.sign, "hex"),
  );
  if (!keyMatches || !valid)
    throw new DeskError(401, "MANGO_SIGNATURE", "Недействительная подпись");
  let event;
  try {
    event = JSON.parse(form.json);
  } catch {
    throw new DeskError(400, "MANGO_JSON", "Некорректное событие");
  }
  return { event, tenant: digest(credentials.apiKey) };
}
function shortText(value: unknown, required = false) {
  if (value === undefined || value === null) {
    if (!required) return "";
    throw new DeskError(400, "MANGO_EVENT", "Не указан идентификатор вызова");
  }
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value) > 128 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new DeskError(400, "MANGO_EVENT", "Некорректное поле вызова");
  return value;
}
export function normalizeExternalPhone(value: unknown) {
  if (typeof value !== "string" || !/^\+?[\d ()-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8"))
    digits = "7" + digits.slice(1);
  return /^\d{10,15}$/.test(digits) ? digits : null;
}
export function parseMangoCall(raw: unknown) {
  const e = raw as Record<string, any>;
  if (
    !e ||
    Array.isArray(e) ||
    !["Appeared", "Connected", "OnHold", "Disconnected"].includes(
      e.call_state,
    ) ||
    !["ivr", "queue", "abonent"].includes(e.location)
  )
    throw new DeskError(400, "MANGO_EVENT", "Неизвестное состояние вызова");
  const seq =
    typeof e.seq === "string" && /^\d+$/.test(e.seq) ? Number(e.seq) : e.seq;
  const timestamp =
    typeof e.timestamp === "string" && /^\d+$/.test(e.timestamp)
      ? Number(e.timestamp)
      : e.timestamp;
  if (
    !Number.isSafeInteger(seq) ||
    seq < 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 9999999999
  )
    throw new DeskError(
      400,
      "MANGO_EVENT",
      "Некорректная последовательность события",
    );
  const extension = (value: unknown) =>
    value == null ? "" : shortText(String(value));
  const call = {
    callId: shortText(e.call_id, true),
    entryId: shortText(e.entry_id, true),
    seq,
    state: e.call_state as string,
    location: e.location as string,
    timestamp,
    from: shortText(e.from?.number),
    to: shortText(e.to?.number),
    fromExtension: extension(e.from?.extension),
    toExtension: extension(e.to?.extension),
  };
  return call;
}
export async function receiveMangoCall(
  sql: Sql,
  form: unknown,
  credentials: MangoCredentials,
) {
  const verified = verifyMangoForm(form, credentials),
    c = parseMangoCall(verified.event);
  const id = digest(`${verified.tenant}:${c.callId}`);
  const eventId = digest(`${id}:${c.seq}`),
    fingerprint = digest(JSON.stringify(c));
  return sql.transaction(async (trx) => {
    await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [id]);
    const previous = (
      await trx.raw(
        "select fingerprint from woodright_mango_event where id = ?",
        [eventId],
      )
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new DeskError(
          409,
          "MANGO_EVENT_CONFLICT",
          "Событие с таким номером имеет другое содержимое",
        );
      return { duplicate: true, applied: false };
    }
    await trx.raw(
      `insert into woodright_mango_event (id, call_id, seq, fingerprint, payload)
      values (?, ?, ?, ?, ?::jsonb)`,
      [eventId, id, c.seq, fingerprint, JSON.stringify(c)],
    );
    const updated = await trx.raw(
      `insert into woodright_mango_call
      (id, tenant, provider_call_id, entry_id, seq, state, location, provider_timestamp, from_number, to_number, from_extension, to_extension)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id) do update set seq = excluded.seq, state = excluded.state, location = excluded.location,
        provider_timestamp = excluded.provider_timestamp, from_number = excluded.from_number, to_number = excluded.to_number,
        from_extension = excluded.from_extension, to_extension = excluded.to_extension, updated_at = now()
      where woodright_mango_call.seq < excluded.seq returning id`,
      [
        id,
        verified.tenant,
        c.callId,
        c.entryId,
        c.seq,
        c.state,
        c.location,
        c.timestamp,
        c.from,
        c.to,
        c.fromExtension,
        c.toExtension,
      ],
    );
    return { duplicate: false, applied: updated.rows.length === 1 };
  });
}
/** Preparation only. MANGO does not deduplicate command_id; network retries require reconciliation. */
export function buildMangoCallback(
  input: { operationId: string; staffId: string; phone: string },
  extensions: Record<string, string>,
) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.operationId))
    throw new DeskError(400, "MANGO_COMMAND", "Не указан ключ звонка");
  const phone = normalizeExternalPhone(input.phone),
    extension = extensions[input.staffId];
  if (!phone || !extension || !/^\d{1,10}$/.test(extension))
    throw new DeskError(
      400,
      "MANGO_STAFF_MAPPING",
      "Укажите внутренний номер сотрудника и телефон клиента",
    );
  return {
    path: "/vpbx/commands/callback",
    payload: {
      command_id: input.operationId,
      from: { extension },
      to_number: phone,
    },
    retryPolicy: "reconcile-before-retry" as const,
  };
}
