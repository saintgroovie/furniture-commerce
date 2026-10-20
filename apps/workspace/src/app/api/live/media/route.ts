import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  upstream,
  verifiedBackend,
  backendBase,
  LiveError,
} from "@/server/live.mjs";
import { safeMediaUrl, mediaFetchUrl } from "@/server/media-policy.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await staff(),
      query = new URL(request.url).searchParams,
      id = query.get("productId") || "",
      index = Number(query.get("index"));
    if (
      !/^[\w-]{1,160}$/.test(id) ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index > 500
    )
      throw new LiveError(400, "Некорректное изображение");
    await verifiedBackend();
    const { product } = await upstream(
      `/admin/woodright/products/${encodeURIComponent(id)}`,
      { session },
    );
    const urls = [
      ...new Set(
        [product?.thumbnail, ...(product?.image_urls || [])].filter(Boolean),
      ),
    ];
    const allowed = (process.env.WOODRIGHT_MEDIA_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const url = safeMediaUrl(urls[index], backendBase().origin, allowed);
    if (!url) throw new LiveError(403, "Источник фотографии не подтверждён");
    const publicApis = (process.env.WOODRIGHT_PUBLIC_API_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const response = await fetch(
      mediaFetchUrl(url, backendBase().origin, publicApis),
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    const type = response.headers.get("content-type")?.split(";")[0];
    if (
      !response.ok ||
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/gif",
      ].includes(type || "")
    )
      throw new LiveError(502, "Фотография недоступна");
    if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024)
      throw new LiveError(413, "Фотография слишком большая");
    const reader = response.body?.getReader();
    if (!reader) throw new LiveError(502, "Фотография недоступна");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new LiveError(413, "Фотография слишком большая");
      }
      chunks.push(value);
    }
    return new Response(Buffer.concat(chunks), {
      headers: {
        ...NO_STORE,
        "Content-Type": type!,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        message: e instanceof LiveError ? e.message : "Не удалось открыть фото",
      },
      { status: e instanceof LiveError ? e.status : 502, headers: NO_STORE },
    );
  }
}
