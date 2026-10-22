import { NextResponse } from "next/server";
import { NO_STORE, sameOrigin } from "@/server/live.mjs";
import {
  catalogContext,
  catalogFailure,
  uploadCatalogFile,
} from "@/server/catalog.mjs";
import {
  catalogId,
  CatalogError,
  catalogVersion,
  imagesBody,
  imageMime,
  mediaKey,
} from "@/server/catalog-policy.mjs";
import {
  readCatalog,
  editorSnapshot,
  catalogLock,
} from "@/server/catalog-service.mjs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { send, session } = await catalogContext(true);
    const limit = 8 * 1024 * 1024 + 65536;
    if (Number(request.headers.get("content-length")) > limit)
      throw new CatalogError(413, "Фотография должна быть не больше 8 МБ");
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data;")
    )
      throw new CatalogError(400, "Выберите фотографию");
    const reader = request.body?.getReader();
    if (!reader) throw new CatalogError(400, "Пустой файл");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new CatalogError(413, "Фотография должна быть не больше 8 МБ");
      }
      chunks.push(value);
    }
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type")! },
      body: Buffer.concat(chunks),
    }).formData();
    const id = catalogId(form.get("id")),
      version = form.get("version"),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 8 * 1024 * 1024 ||
      form.getAll("file").length !== 1
    )
      throw new CatalogError(400, "Выберите одну фотографию до 8 МБ");
    const mime = imageMime(await file.arrayBuffer());
    if (!mime || mime !== file.type)
      throw new CatalogError(
        400,
        "Поддерживаются фотографии JPG, PNG и WebP; содержимое должно соответствовать формату",
      );
    const result = await catalogLock(id, async () => {
      const state = await readCatalog(id, send);
      if (version !== catalogVersion(state.product))
        throw new CatalogError(
          409,
          "Карточка изменилась. Обновите её перед загрузкой",
        );
      if ((state.product.images || []).length >= 100)
        throw new CatalogError(400, "В галерее уже 100 фотографий");
      const ext =
        mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
      const saved = await uploadCatalogFile(
        session,
        new File([file], `woodright-${id}-${crypto.randomUUID()}.${ext}`, {
          type: mime,
        }),
      );
      const url = mediaKey(saved.url);
      // Only the native file provider supplies new URLs; clients cannot attach arbitrary URLs.
      if (!/^\/static\/[\w./-]+$/.test(url) || url.includes(".."))
        throw new CatalogError(
          502,
          "Хранилище вернуло неподдерживаемый адрес фотографии",
        );
      const images = [
        ...(state.product.images || []).map((i: { url: string }) => i.url),
      ];
      if (
        state.product.thumbnail &&
        !images.some(
          (u: string) => mediaKey(u) === mediaKey(state.product.thumbnail),
        )
      )
        images.unshift(state.product.thumbnail);
      const body = imagesBody(
        { images: [...images, url], thumbnail: state.product.thumbnail || url },
        state.product,
        state.seller,
        [url],
      );
      await send(`/admin/products/${id}`, "POST", body);
      return {
        product: editorSnapshot(await readCatalog(id, send)),
        uploadedFile: { id: saved.id, url },
      };
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    const failure = catalogFailure(e);
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: NO_STORE },
    );
  }
}
