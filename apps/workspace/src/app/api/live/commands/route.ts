import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  sameOrigin,
  upstream,
  verifiedBackend,
  LiveError,
} from "@/server/live.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await staff();
    if (process.env.WOODRIGHT_LIVE_WRITES !== "1")
      throw new LiveError(
        403,
        "Сохранение пока не включено для этого подключения",
      );
    const max = 12 * 1024 * 1024;
    if (Number(request.headers.get("content-length")) > max)
      throw new LiveError(413, "Запрос слишком большой");
    const command = await readJsonBounded(request, max);
    await verifiedBackend();
    if (
      [
        "request.update",
        "request.create",
        "person.create",
        "person.update",
        "reminder.create",
        "reminder.update",
        "attachment.upload",
        "attachment.remove",
      ].includes(command.type)
    ) {
      const capabilities = await upstream(
        "/admin/woodright/desk/capabilities",
        { session },
      );
      const required =
        command.type === "person.update"
          ? "personUpdate"
          : command.type.endsWith(".create") &&
              ["request.create", "person.create"].includes(command.type)
            ? "crmCreate"
            : command.type.startsWith("reminder.")
              ? "reminders"
              : command.type.startsWith("attachment.")
                ? "attachments"
                : "requestUpdate";
      if (
        capabilities.contract !== "woodright-desk-v1" ||
        capabilities[required] !== true
      )
        throw new LiveError(403, "Функция ещё не подключена в Medusa");
      const result = await upstream("/admin/woodright/desk/commands", {
        session,
        method: "POST",
        body: command,
      });
      return NextResponse.json(result, { headers: NO_STORE });
    }
    throw new LiveError(
      403,
      "Это действие ещё не подключено к рабочему контуру",
    );
  } catch (e) {
    const known = e instanceof LiveError;
    return NextResponse.json(
      { message: known ? e.message : "Не удалось сохранить" },
      { status: known ? e.status : 400, headers: NO_STORE },
    );
  }
}
