import { NextResponse } from "next/server";
import {
  NO_STORE,
  LiveError,
  staff,
  upstream,
  verifiedBackend,
  readPaged,
} from "@/server/live.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await staff();
    const params = new URL(request.url).searchParams;
    const type = params.get("entityType"),
      id = params.get("entityId");
    const archived = params.get("archived") || "0";
    if (
      !type ||
      !["person", "request", "order", "company", "invoice"].includes(type) ||
      !["0", "1"].includes(archived) ||
      !id ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(id)
    )
      throw new LiveError(400, "Выберите карточку");
    await verifiedBackend();
    const result = await readPaged(
      `/admin/woodright/desk/attachments?entity_type=${type}&entity_id=${encodeURIComponent(id)}&archived=${archived}`,
      "attachments",
      session,
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось загрузить вложения",
      },
      { status: e instanceof LiveError ? e.status : 500, headers: NO_STORE },
    );
  }
}
