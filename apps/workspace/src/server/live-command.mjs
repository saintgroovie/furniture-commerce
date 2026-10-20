import { stageLabels } from "./live-projection.mjs";
export class CommandError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function executeCommand(command, { read, send }) {
  if (
    !command ||
    typeof command !== "object" ||
    typeof command.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(command.id)
  )
    throw new CommandError(400, "Некорректный объект");
  const id = encodeURIComponent(command.id);
  if (command.type === "request.update") {
    throw new CommandError(
      403,
      "Используйте атомарную команду установленного модуля Woodright OS",
    );
  }
  if (command.type === "order.transition") {
    if (
      !Object.hasOwn(stageLabels, command.stage) ||
      !Number.isSafeInteger(command.expectedVersion) ||
      command.expectedVersion < 0 ||
      typeof command.note !== "string" ||
      command.note.length > 5000
    )
      throw new CommandError(400, "Проверьте этап и версию заказа");
    if (command.stage === "paused" && !command.note.trim())
      throw new CommandError(400, "Укажите причину приостановки");
    if (typeof command.key !== "string" || !/^[\w-]{16,100}$/.test(command.key))
      throw new CommandError(400, "Не указан ключ операции");
    return send(`/admin/woodright/order-processes/${id}/transitions`, "POST", {
      to_stage: command.stage,
      expected_version: command.expectedVersion,
      internal_note: command.note.trim() || null,
      paused_reason: command.stage === "paused" ? command.note.trim() : null,
      notify_customer: false,
      idempotency_key: command.key,
    });
  }
  throw new CommandError(400, "Действие пока не подключено к рабочей Medusa");
}
