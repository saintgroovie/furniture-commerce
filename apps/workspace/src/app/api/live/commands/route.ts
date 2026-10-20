import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  sameOrigin,
  upstream,
  verifiedBackend,
  LiveError,
} from "@/server/live.mjs";
import { executeCommand, CommandError } from "@/server/live-command.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await staff();
    if (process.env.WOODRIGHT_LIVE_WRITES !== "1")
      throw new LiveError(
        403,
        "Рабочие данные открыты для просмотра. Запись включается после проверки прав и сохранения на изолированной базе",
      );
    if (Number(request.headers.get("content-length")) > 65536)
      throw new LiveError(413, "Запрос слишком большой");
    const command = await readJsonBounded(request, 65536);
    if (command.type === "request.update")
      throw new LiveError(
        403,
        "Сохранение обращения требует атомарной проверки версии в Medusa. Защита ещё не установлена",
      );
    await verifiedBackend();
    const result = await executeCommand(command, {
      read: (path: string) => upstream(path, { session }),
      send: (path: string, method: string, body: unknown) =>
        upstream(path, { session, method, body }),
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (e) {
    const known = e instanceof LiveError || e instanceof CommandError;
    return NextResponse.json(
      { message: known ? e.message : "Не удалось сохранить" },
      { status: known ? e.status : 400, headers: NO_STORE },
    );
  }
}
