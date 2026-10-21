import { NextResponse } from "next/server";
import {
  NO_STORE,
  LiveError,
  staff,
  verifiedBackend,
  readPaged,
} from "@/server/live.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await staff();
    await verifiedBackend();
    const result = await readPaged(
      "/admin/woodright/desk/files",
      "attachments",
      session,
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось загрузить файлы",
      },
      { status: e instanceof LiveError ? e.status : 500, headers: NO_STORE },
    );
  }
}
