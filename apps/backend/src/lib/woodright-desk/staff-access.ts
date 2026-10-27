import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http";
import { DeskError, identifier, type Sql } from "./commands";

export const STAFF_ROLES = [
  "seller",
  "production",
  "accountant",
  "director",
  "god",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffAccess = {
  actorId: string;
  role: StaffRole;
  enabled: boolean;
  version: number;
};
export const ROLE_NAMES: Record<StaffRole, string> = {
  seller: "Продавец",
  production: "Производство",
  accountant: "Бухгалтер",
  director: "Директор",
  god: "Полный администратор",
};
const business = [
  "today",
  "requests",
  "people",
  "companies",
  "orders",
  "invoices",
  "files",
  "products",
  "rooms",
  "profile",
];
export function accessPages(role: StaffRole) {
  if (role === "production")
    return ["today", "requests", "orders", "files", "profile"];
  if (role === "accountant")
    return ["today", "companies", "orders", "invoices", "files", "profile"];
  if (role === "seller") return business;
  return [...business, "storefront", "integrations", "team"];
}
export function parseStaffAccess(user: any): StaffAccess {
  const value = user?.metadata?.woodright_access;
  if (
    !value ||
    !STAFF_ROLES.includes(value.role) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  )
    throw new DeskError(
      403,
      "STAFF_ROLE_REQUIRED",
      "Администратор ещё не назначил вам рабочую роль",
    );
  if (
    value.enabled !== true ||
    user.deleted_at ||
    (value.expiresAt != null &&
      (!Number.isFinite(Date.parse(value.expiresAt)) ||
        Date.parse(value.expiresAt) <= Date.now()))
  )
    throw new DeskError(401, "STAFF_DISABLED", "Доступ сотрудника закрыт");
  return {
    actorId: user.id,
    role: value.role,
    version: value.version,
    enabled: true,
  };
}
export async function staffAccess(req: MedusaRequest) {
  const actor = (req as any).auth_context;
  if (!actor?.actor_id || actor.actor_type !== "user")
    throw new DeskError(401, "STAFF_REQUIRED", "Войдите под сотрудником");
  const user = await (req.scope.resolve("user") as any).retrieveUser(
    actor.actor_id,
  );
  return parseStaffAccess(user);
}
export function roleCapabilities(role: StaffRole) {
  const crm = ["seller", "director", "god"].includes(role);
  return {
    crmCreate: crm,
    orderCreate: crm,
    personUpdate: crm,
    requestUpdate: crm || role === "production",
    companies: role !== "production",
    assignments: crm,
    manageStaff: role === "god",
    attachments: true,
    reminders: true,
    history: true,
    invoiceRead: role !== "production",
    invoiceDraft: role !== "production",
    invoiceRegister: role === "accountant" || role === "god",
    access: {
      role,
      label: ROLE_NAMES[role],
      pages: accessPages(role),
      manageStaff: role === "god",
      financial: role !== "production",
      assignedOnly: role === "production",
    },
  };
}
export function routeAllowed(role: StaffRole, method: string, path: string) {
  if (role === "god") return true;
  if (path === "/admin/users/me" && method === "GET") return true;
  if (path === "/admin/woodright/desk/access") return method === "GET";
  if (path === "/admin/woodright/desk/order-catalog")
    return method === "GET" && roleCapabilities(role).orderCreate;
  const deskRead = [
    "capabilities",
    "staff",
    "records",
    "reminders",
    "files",
    "history",
    "attachments",
    "production",
    "orders",
  ];
  if (
    method === "GET" &&
    (deskRead.some((x) => path === `/admin/woodright/desk/${x}`) ||
      /^\/admin\/woodright\/desk\/attachments\/[\w-]+\/content$/.test(path))
  )
    return true;
  if (path === "/admin/woodright/desk/companies" && method === "GET")
    return role !== "production";
  if (path === "/admin/woodright/desk/invoices" && method === "GET")
    return role !== "production";
  if (
    [
      "/admin/woodright/desk/commands",
      "/admin/woodright/desk/password",
    ].includes(path)
  )
    return method === "POST";
  if (role === "production" || method !== "GET") return false;
  const reads = ["/admin/orders", "/admin/woodright/order-processes"];
  if (role !== "accountant")
    reads.push(
      "/admin/leads",
      "/admin/bespoke-requests",
      "/admin/woodright/products",
      "/admin/room-sets",
    );
  return reads.includes(path);
}
export async function enforceStaffAccess(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  try {
    const access = await staffAccess(req);
    const path = (req.originalUrl || req.url).split("?")[0].replace(/\/$/, "");
    if (!routeAllowed(access.role, req.method, path))
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Это действие недоступно вашей рабочей роли",
      );
    next();
  } catch (e) {
    const error =
      e instanceof DeskError
        ? e
        : new DeskError(
            503,
            "ACCESS_UNAVAILABLE",
            "Не удалось проверить права. Обновите страницу",
          );
    res.setHeader("Cache-Control", "private, no-store");
    res.status(error.status).json({ code: error.code, message: error.message });
  }
}
export async function assertEntityAccess(
  sql: Sql,
  access: StaffAccess,
  type: string,
  id: string,
) {
  if (access.role !== "production") return;
  if (
    !["request", "order"].includes(type) ||
    !(
      await sql.raw(
        "select 1 from woodright_desk_record where entity_type = ? and entity_id = ? and assignee_id = ? for share",
        [type, identifier(id), access.actorId],
      )
    ).rows.length
  )
    throw new DeskError(
      403,
      "ASSIGNED_WORK_REQUIRED",
      "Производству доступны только назначенные ему работы",
    );
}
export async function authorizeDeskCommand(
  sql: Sql,
  access: StaffAccess,
  command: any,
) {
  const type = command?.type;
  const caps = roleCapabilities(access.role);
  const allowed =
    type === "order.create"
      ? caps.orderCreate
      : type === "invoice.register"
      ? caps.invoiceRegister
      : type?.startsWith("invoice.")
        ? caps.invoiceDraft
        : type?.startsWith("company.")
          ? caps.companies
          : type === "record.update"
            ? caps.assignments
            : type?.startsWith("person.")
              ? caps.personUpdate
              : type === "request.create"
                ? caps.crmCreate
                : type === "request.update"
                  ? caps.requestUpdate
                  : [
                      "attachment.upload",
                      "attachment.remove",
                      "attachment.restore",
                      "reminder.create",
                      "reminder.update",
                    ].includes(type);
  if (!allowed)
    throw new DeskError(
      403,
      "ROLE_FORBIDDEN",
      "Это действие недоступно вашей рабочей роли",
    );
  if (
    type === "request.update" &&
    command.details !== undefined &&
    !caps.crmCreate
  )
    throw new DeskError(
      403,
      "ROLE_FORBIDDEN",
      "Спецификацию обращения редактируют продажи и руководство",
    );
  if (type === "invoice.archive" && access.role === "seller") {
    const invoice = (
      await sql.raw(
        "select accounting_number from woodright_invoice where id=? for update",
        [identifier(command.id)],
      )
    ).rows[0];
    if (invoice?.accounting_number)
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Архив зарегистрированных счетов ведёт бухгалтер или директор",
      );
  }
  if (
    !caps.assignments &&
    type?.startsWith("reminder.") &&
    command.assigneeId !== undefined &&
    command.assigneeId !== access.actorId
  )
    throw new DeskError(
      403,
      "ROLE_FORBIDDEN",
      "Можно назначить напоминание только себе",
    );
  let entityType = command.entityType,
    entityId = command.entityId;
  if (type === "request.update") {
    entityType = "request";
    entityId = command.id;
  }
  if (
    ["attachment.remove", "attachment.restore", "reminder.update"].includes(
      type,
    )
  ) {
    const table = type.startsWith("attachment.")
      ? "woodright_private_attachment"
      : "woodright_follow_up";
    const row = (
      await sql.raw(
        `select * from ${table} where id = ? ${type === "attachment.restore" ? "" : "and deleted_at is null"}`,
        [identifier(command.id)],
      )
    ).rows[0];
    if (!row) throw new DeskError(404, "NOT_FOUND", "Запись не найдена");
    entityType = row.entity_type;
    entityId = row.entity_id;
    if (
      type === "reminder.update" &&
      !caps.assignments &&
      row.assignee_id !== access.actorId
    )
      throw new DeskError(403, "ROLE_FORBIDDEN", "Измените своё напоминание");
    if (
      type.startsWith("attachment.") &&
      !["god", "director"].includes(access.role) &&
      row.uploaded_by !== access.actorId
    )
      throw new DeskError(
        403,
        "FILE_OWNER_REQUIRED",
        "Удалить чужой файл может директор или администратор",
      );
    if (
      type.startsWith("attachment.") &&
      access.role === "production" &&
      row.visibility !== "assigned"
    )
      throw new DeskError(
        403,
        "FILE_VISIBILITY_REQUIRED",
        "Этот документ недоступен производству",
      );
  }
  if (
    type === "attachment.upload" &&
    command.entityType === "invoice" &&
    command.visibility &&
    command.visibility !== "business"
  )
    throw new DeskError(
      400,
      "INVALID_FILE_VISIBILITY",
      "Счета доступны только продажам и бухгалтерии",
    );
  if (access.role === "production") {
    await assertEntityAccess(sql, access, entityType, entityId);
    if (type === "attachment.upload" && command.visibility !== "assigned")
      throw new DeskError(
        403,
        "FILE_VISIBILITY_REQUIRED",
        "Рабочие файлы производства сохраняются в назначенной работе",
      );
    if (
      type === "request.update" &&
      !["in_production", "completed"].includes(command.status)
    )
      throw new DeskError(
        403,
        "PRODUCTION_STATUS_ONLY",
        "Выберите производственный статус",
      );
    if (
      type === "reminder.create" &&
      command.assigneeId &&
      command.assigneeId !== access.actorId
    )
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Можно назначить напоминание только себе",
      );
  }
}
