import { createHash } from "node:crypto";
export class CatalogError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const CATALOG_COLLECTIONS = [
  ["greenwich", "Гринвич"],
  ["oliver", "Оливер"],
  ["oliver-adult", "Оливер · взрослые"],
  ["oliver-kids", "Оливер · детские"],
  ["willie-winkie", "Вилли Винки"],
  ["monchelsea", "Мончелси"],
  ["princess-rose", "Принцесса Роза"],
];
export const catalogAllowed = (features) => features?.access?.role === "god";
export function catalogId(value) {
  if (typeof value !== "string" || !/^[\w-]{1,160}$/.test(value))
    throw new CatalogError(400, "Некорректный идентификатор");
  return value;
}
const str = (v, max, label, required = false) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new CatalogError(400, `Проверьте поле «${label}»`);
  return v.trim();
};
export function catalogVersion(product) {
  // Include price/option/image relations: product.updated_at alone misses variant edits.
  return createHash("sha256").update(JSON.stringify(product)).digest("hex");
}
export function mediaKey(value) {
  try {
    const u = new URL(value, "https://api.woodright.ru");
    return u.pathname.startsWith("/static/") ? u.pathname + u.search : value;
  } catch {
    return value;
  }
}
export function baseRubPrice(variant) {
  const prices = (variant.prices || []).filter(
    (p) =>
      p.currency_code === "rub" &&
      p.min_quantity == null &&
      p.max_quantity == null &&
      !Object.keys(p.rules || {}).length,
  );
  if (prices.length > 1)
    throw new CatalogError(
      409,
      "Найдено несколько базовых цен. Нужна сверка цен в Medusa",
    );
  return prices[0] || null;
}
export function withRubPrice(variant, value, confirmed = false) {
  const raw = String(value).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new CatalogError(
      400,
      "Укажите положительную цену в рублях, не больше двух знаков после запятой",
    );
  const amount = Number(raw),
    old = baseRubPrice(variant);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)
    throw new CatalogError(
      400,
      "Цена должна быть больше нуля и не превышать 10 000 000 ₽",
    );
  if (
    old?.amount > 0 &&
    (amount > old.amount * 3 || amount < old.amount / 3) &&
    !confirmed
  )
    throw new CatalogError(
      409,
      "Цена отличается более чем в три раза. Подтвердите изменение суммы",
    );
  const rest = (variant.prices || []).map((p) => ({
    id: p.id,
    currency_code: p.currency_code,
    amount: p.id === old?.id ? amount : p.amount,
    min_quantity: p.min_quantity ?? null,
    max_quantity: p.max_quantity ?? null,
    rules: p.rules || {},
  }));
  if (!old) rest.push({ currency_code: "rub", amount });
  return rest;
}
export function variantBody(input, product) {
  const existing = input.variantId
    ? product.variants?.find((v) => v.id === input.variantId)
    : null;
  if (input.variantId && !existing)
    throw new CatalogError(404, "Вариант не принадлежит этому товару");
  const title = str(input.title, 180, "Название варианта", true);
  const sku = str(input.sku, 64, "Артикул", true).replace(/\s+/g, " ");
  if (
    product.variants?.some(
      (v) =>
        v.id !== existing?.id && v.sku?.toLowerCase() === sku.toLowerCase(),
    )
  )
    throw new CatalogError(409, "Такой артикул уже есть у товара");
  const options = {};
  for (const option of product.options || []) {
    const value = input.options?.[option.id];
    if (!option.values?.some((v) => v.value === value))
      throw new CatalogError(
        400,
        `Выберите значение «${option.title === "Default" ? "Исполнение" : option.title}»`,
      );
    options[option.id] = value;
  }
  if (
    Object.keys(input.options || {}).some(
      (key) => !(product.options || []).some((o) => o.id === key),
    )
  )
    throw new CatalogError(400, "Неизвестный параметр варианта");
  if (
    product.variants?.some(
      (v) =>
        v.id !== existing?.id &&
        (product.options || []).every((o) =>
          v.options?.some(
            (value) =>
              value.option_id === o.id && value.value === options[o.id],
          ),
        ),
    )
  )
    throw new CatalogError(
      409,
      "Вариант с таким сочетанием параметров уже существует",
    );
  const nativeOptions = Object.fromEntries(
    (product.options || []).map((o) => [o.title, options[o.id]]),
  );
  const body = { title, sku, options: nativeOptions };
  if (!existing) body.manage_inventory = false;
  if (!existing || input.price !== "")
    body.prices = withRubPrice(
      existing || { prices: [] },
      input.price,
      input.confirmPrice === true,
    );
  return body;
}
export function basicBody(input) {
  return {
    title: str(input.title, 180, "Название", true),
    subtitle: str(input.subtitle, 500, "Подзаголовок"),
    description: str(input.description, 30000, "Описание"),
  };
}
export function createBody(input) {
  const title = str(input.title, 180, "Название", true),
    sku = str(input.sku, 64, "Артикул", true);
  if (
    !["STANDARD", "CONFIGURABLE", "BESPOKE"].includes(input.classification) ||
    !CATALOG_COLLECTIONS.some(([key]) => key === input.collection_key)
  )
    throw new CatalogError(400, "Выберите тип товара и коллекцию");
  return {
    title,
    sku,
    classification: input.classification,
    collection_key: input.collection_key,
  };
}
export function imagesBody(input, product, seller, newUrls = []) {
  if (
    !Array.isArray(input.images) ||
    input.images.length > 100 ||
    input.images.some((x) => typeof x !== "string")
  )
    throw new CatalogError(400, "Некорректный список фотографий");
  const known = new Map(
    (product.images || []).map((i) => [mediaKey(i.url), i]),
  );
  if (product.thumbnail && !known.has(mediaKey(product.thumbnail)))
    known.set(mediaKey(product.thumbnail), { url: product.thumbnail });
  const added = new Set(newUrls.map(mediaKey));
  const keys = input.images.map(mediaKey);
  if (
    new Set(keys).size !== keys.length ||
    keys.some((k) => !known.has(k) && !added.has(k))
  )
    throw new CatalogError(
      400,
      "Можно использовать только фотографии этого товара или только что загруженные файлы",
    );
  const general = new Set((seller.general_image_urls || []).map(mediaKey));
  if (seller.execution_media_guard) {
    for (const [key] of known)
      if (!general.has(key) && !keys.includes(key))
        throw new CatalogError(
          409,
          "Фотография привязана к исполнению. Сначала измените привязку исполнения",
        );
  }
  const thumb = input.thumbnail == null ? null : mediaKey(input.thumbnail);
  if (thumb && !keys.includes(thumb))
    throw new CatalogError(400, "Главное фото должно быть в галерее");
  return {
    images: keys.map((k) =>
      known.has(k)
        ? {
            ...(known.get(k).id ? { id: known.get(k).id } : {}),
            url: known.get(k).url,
          }
        : { url: k },
    ),
    thumbnail: thumb ? known.get(thumb)?.url || thumb : null,
  };
}
export function optionBody(input, product) {
  const value = str(input.value, 120, "Значение параметра", true);
  if (input.optionId) {
    const option = product.options?.find((o) => o.id === input.optionId);
    if (!option)
      throw new CatalogError(404, "Параметр не принадлежит этому товару");
    if (
      option.values?.some((v) => v.value.toLowerCase() === value.toLowerCase())
    )
      throw new CatalogError(409, "Это значение уже добавлено");
    return { update: [{ product_option_id: option.id, add: [{ value }] }] };
  }
  // Adding a dimension to existing variants requires an explicit value for those variants.
  // Keep dimensions stable; offer additive values for their existing product-scoped options.
  throw new CatalogError(400, "Выберите параметр товара");
}
export function imageMime(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "image/jpeg";
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
