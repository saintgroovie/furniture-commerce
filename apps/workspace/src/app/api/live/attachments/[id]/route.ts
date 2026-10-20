import { NextResponse } from "next/server";
import {
  NO_STORE,
  LiveError,
  staff,
  verifiedBackend,
  backendBase,
} from "@/server/live.mjs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await staff(),
      { id } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id))
      throw new LiveError(400, "Некорректный файл");
    await verifiedBackend();
    const response = await fetch(
      new URL(
        `/admin/woodright/desk/attachments/${encodeURIComponent(id)}/content`,
        backendBase(),
      ),
      {
        headers: { authorization: `Bearer ${session.token}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new LiveError(
        response.status,
        response.status === 404
          ? "Вложение удалено или недоступно"
          : "Не удалось скачать файл",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new LiveError(502, "Файл не передан");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024)
          throw new LiveError(413, "Файл превышает допустимый размер");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const disposition = response.headers.get("content-disposition");
    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": disposition?.startsWith("attachment;")
          ? disposition
          : 'attachment; filename="document"',
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        message: e instanceof LiveError ? e.message : "Не удалось скачать файл",
      },
      { status: e instanceof LiveError ? e.status : 502, headers: NO_STORE },
    );
  }
}
