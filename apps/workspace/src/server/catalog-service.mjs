import {
  CatalogError,
  catalogId,
  catalogVersion,
  basicBody,
  createBody,
  variantBody,
  imagesBody,
  optionBody,
  baseRubPrice,
  mediaKey,
} from "./catalog-policy.mjs";
const locks = (globalThis[Symbol.for("woodright.catalog.locks")] ||= new Set());
export async function catalogLock(id, work) {
  if (locks.has(id))
    throw new CatalogError(
      409,
      "Товар сейчас сохраняется. Дождитесь завершения и обновите карточку",
    );
  locks.add(id);
  try {
    return await work();
  } finally {
    locks.delete(id);
  }
}
export async function readCatalog(id, send) {
  catalogId(id);
  const results = await Promise.allSettled([
    send(`/admin/products/${id}`),
    send(`/admin/woodright/products/${id}`),
  ]);
  for (const r of results) if (r.status === "rejected") throw r.reason;
  const product = results[0].value.product,
    seller = results[1].value.product;
  if (!product || !seller || product.id !== id || seller.id !== id)
    throw new CatalogError(404, "Товар не найден");
  return { product, seller };
}
export async function assertSkuAvailable(sku, send, ownVariantId = "") {
  const { products } = await send("/admin/woodright/products");
  if (!Array.isArray(products))
    throw new CatalogError(502, "Не удалось проверить уникальность артикула");
  if (
    products.some((p) =>
      (p.variants || []).some(
        (v) =>
          v.id !== ownVariantId &&
          v.sku?.trim().toLowerCase() === sku.trim().toLowerCase(),
      ),
    )
  )
    throw new CatalogError(
      409,
      "Такой артикул уже используется. Укажите уникальный артикул варианта",
    );
}
export function editorSnapshot({ product, seller }) {
  const urls = [
    ...new Set(
      [seller.thumbnail, ...(seller.image_urls || [])].filter(Boolean),
    ),
  ];
  const general = new Set((seller.general_image_urls || []).map(mediaKey));
  const images = [...(product.images || [])];
  if (
    product.thumbnail &&
    !images.some((i) => mediaKey(i.url) === mediaKey(product.thumbnail))
  )
    images.unshift({ url: product.thumbnail });
  return {
    id: product.id,
    title: product.title,
    subtitle: product.subtitle || "",
    description: product.description || "",
    status: product.status,
    version: catalogVersion(product),
    thumbnail: product.thumbnail || null,
    images: images.map((i) => ({
      id: i.id || null,
      url: i.url,
      index: urls.findIndex((u) => mediaKey(u) === mediaKey(i.url)),
      protected:
        seller.execution_media_guard === true && !general.has(mediaKey(i.url)),
    })),
    options: (product.options || []).map((o) => ({
      id: o.id,
      title: o.title,
      values: (o.values || []).map((v) => ({ id: v.id, value: v.value })),
    })),
    variants: (product.variants || []).map((v) => {
      let price = null,
        priceError = "";
      try {
        price = baseRubPrice(v)?.amount ?? null;
      } catch (e) {
        priceError = e.message;
      }
      return {
        id: v.id,
        title: v.title || "",
        sku: v.sku || "",
        price,
        priceError,
        options: Object.fromEntries(
          (v.options || []).map((o) => [o.option_id, o.value]),
        ),
        manageInventory: v.manage_inventory === true,
      };
    }),
    collection: seller.collection_label,
    classification: seller.classification,
    hasMaterialTiers: seller.has_material_tiers === true,
    executionMedia: seller.execution_media_guard === true,
    blockers: seller.publish?.blockers || [],
    publishReady: seller.publish?.ready === true,
  };
}
export async function executeCatalog(command, send) {
  if (!command || typeof command !== "object" || Array.isArray(command))
    throw new CatalogError(400, "Некорректная команда");
  const types = {
    create: ["title", "sku", "classification", "collection_key"],
    basics: ["title", "subtitle", "description"],
    variant: ["variantId", "title", "sku", "price", "options", "confirmPrice"],
    media: ["images", "thumbnail"],
    option: ["optionId", "value"],
    publish: [],
    hide: [],
  };
  if (!Object.hasOwn(types, command.type))
    throw new CatalogError(400, "Неизвестное действие каталога");
  const keys = new Set(["type", "id", "version", ...types[command.type]]);
  if (Object.keys(command).some((k) => !keys.has(k)))
    throw new CatalogError(400, "Неизвестное поле команды");
  if (command.type === "create") {
    const body = createBody(command);
    return catalogLock(`sku:${body.sku.toLowerCase()}`, async () => {
      await assertSkuAvailable(body.sku, send);
      const { product } = await send("/admin/woodright/products", "POST", body);
      return editorSnapshot(await readCatalog(catalogId(product?.id), send));
    });
  }
  const id = catalogId(command.id);
  return catalogLock(id, async () => {
    const state = await readCatalog(id, send);
    if (command.version !== catalogVersion(state.product))
      throw new CatalogError(
        409,
        "Карточка изменилась. Загрузите свежую версию; ваши несохранённые изменения остаются в форме",
      );
    if (command.type === "basics")
      await send(`/admin/products/${id}`, "POST", basicBody(command));
    if (command.type === "variant") {
      const body = variantBody(command, state.product);
      const suffix = command.variantId
        ? `/${catalogId(command.variantId)}`
        : "";
      await catalogLock(`sku:${body.sku.toLowerCase()}`, async () => {
        await assertSkuAvailable(body.sku, send, command.variantId || "");
        await send(`/admin/products/${id}/variants${suffix}`, "POST", body);
      });
    }
    if (command.type === "option")
      await send(
        `/admin/products/${id}/options/batch`,
        "POST",
        optionBody(command, state.product),
      );
    if (command.type === "media")
      await send(
        `/admin/products/${id}`,
        "POST",
        imagesBody(command, state.product, state.seller),
      );
    if (command.type === "publish") {
      if (!state.seller.publish?.ready)
        throw new CatalogError(
          409,
          (state.seller.publish?.blockers || [])
            .map((b) => b.message)
            .join(". ") || "Заполните обязательные данные товара",
        );
      if (!(state.product.sales_channels || []).length) {
        const { stores } = await send(
          "/admin/stores?fields=id,default_sales_channel_id",
        );
        if (
          !Array.isArray(stores) ||
          stores.length !== 1 ||
          !stores[0].default_sales_channel_id
        )
          throw new CatalogError(
            409,
            "В Medusa не выбрана основная витрина магазина. Назначьте её перед публикацией товара",
          );
        // Native draft creation doesn't associate a sales channel. Use the store's
        // explicit default; never guess a channel from list position or another product.
        await send(`/admin/products/${id}`, "POST", {
          sales_channels: [
            { id: catalogId(stores[0].default_sales_channel_id) },
          ],
        });
      }
      await send(`/admin/woodright/products/${id}/publish`, "POST", {});
    }
    if (command.type === "hide")
      await send(`/admin/products/${id}`, "POST", { status: "draft" });
    return editorSnapshot(await readCatalog(id, send));
  });
}
