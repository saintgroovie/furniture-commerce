import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  PencilSimple,
  ArrowUp,
  ArrowDown,
  Image,
  UploadSimple,
  Trash,
  Check,
} from "@phosphor-icons/react";
import {
  Button,
  Drawer,
  Field,
  FormError,
  Notice,
  Section,
  Tabs,
  Badge,
} from "./ui.jsx";
import { liveFetch } from "./storage.js";
import { workspacePath } from "../lib/paths.mjs";
const post = (command) =>
  liveFetch("/api/live/catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
  });
const basics = (p) => ({
  title: p.title,
  subtitle: p.subtitle,
  description: p.description,
});
const variantForm = (v, options) => ({
  variantId: v?.id || "",
  title: v?.title || "",
  sku: v?.sku || "",
  price: v?.price == null ? "" : String(v.price),
  options:
    v?.options ||
    Object.fromEntries(options.map((o) => [o.id, o.values[0]?.value || ""])),
  confirmPrice: false,
});
const optionLabel = (s) => (s === "Default" ? "Исполнение" : s);
const valueLabel = (s) => (s === "Default" ? "Базовое" : s);
const json = JSON.stringify;
export function ProductCreate({ onClose, refresh, go, notify }) {
  const [collections, setCollections] = useState([]),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState(null);
  const [form, setForm] = useState({
    title: "",
    sku: "",
    classification: "STANDARD",
    collection_key: "",
  });
  useEffect(() => {
    let active = true;
    liveFetch("/api/live/catalog")
      .then((d) => {
        if (active) setCollections(d.collections);
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function open(p) {
    try {
      await refresh();
      go("products", p.id);
      onClose();
      notify("Черновик товара создан");
    } catch (e) {
      setError(
        "Товар уже создан. Не создавайте его повторно; обновите список или откройте карточку ещё раз.",
      );
    }
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { product } = await post({ type: "create", ...form });
      setCreated(product);
      await open(product);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title="Новый товар"
      kicker="Каталог"
      onClose={busy ? () => {} : onClose}
      dirty={!created && Object.values(form).some((v) => v && v !== "STANDARD")}
      wide
    >
      <Notice>
        Сначала создайте черновик. Затем заполните описание, загрузите
        фотографии и настройте цены и варианты. До отдельной публикации товар не
        появится на сайте.
      </Notice>
      <FormError>{loadError || error}</FormError>
      {created ? (
        <div className="form-stack">
          <Notice>Черновик «{created.title}» сохранён в рабочей базе.</Notice>
          <Button disabled={busy} onClick={() => open(created)}>
            Открыть сохранённый товар
          </Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <Field label="Название товара">
            <input
              required
              maxLength={180}
              value={form.title}
              disabled={busy}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Артикул первого варианта">
            <input
              required
              maxLength={64}
              value={form.sku}
              disabled={busy}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </Field>
          <Field label="Тип товара">
            <select
              value={form.classification}
              disabled={busy}
              onChange={(e) =>
                setForm({ ...form, classification: e.target.value })
              }
            >
              <option value="STANDARD">Готовое изделие</option>
              <option value="CONFIGURABLE">Выбор исполнения</option>
              <option value="BESPOKE">По проекту</option>
            </select>
          </Field>
          <Field label="Коллекция">
            <select
              required
              value={form.collection_key}
              disabled={busy || !collections.length}
              onChange={(e) =>
                setForm({ ...form, collection_key: e.target.value })
              }
            >
              <option value="">Выберите коллекцию</option>
              {collections.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={busy || !!loadError || !collections.length}
              icon={Plus}
            >
              {busy ? "Создаём…" : "Создать черновик"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
export function ProductEditor({ id, onClose, refresh, notify }) {
  const [product, setProduct] = useState(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("basics");
  const [base, setBase] = useState(null),
    [images, setImages] = useState([]),
    [thumbnail, setThumbnail] = useState(null),
    [variant, setVariant] = useState(null),
    [optionId, setOptionId] = useState(""),
    [optionValue, setOptionValue] = useState("");
  const fileInput = useRef(null);
  function apply(p, section = "all") {
    setProduct(p);
    if (section === "all" || section === "basics") setBase(basics(p));
    if (section === "all" || section === "media") {
      setImages(p.images);
      setThumbnail(p.thumbnail);
    }
    if (section === "all" || section === "variant") setVariant(null);
    if (section === "all" || section === "option") {
      setOptionId(p.options[0]?.id || "");
      setOptionValue("");
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    liveFetch(`/api/live/catalog?id=${encodeURIComponent(id)}`)
      .then(({ product: p }) => {
        if (active) apply(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const basicDirty = !!product && json(base) !== json(basics(product));
  const mediaDirty =
    !!product &&
    (json(images.map((i) => i.url)) !==
      json(product.images.map((i) => i.url)) ||
      thumbnail !== product.thumbnail);
  const originalVariant = product?.variants.find(
    (v) => v.id === variant?.variantId,
  );
  const variantDirty =
    !!variant &&
    json(variant) !== json(variantForm(originalVariant, product.options));
  const dirty =
    basicDirty || mediaDirty || variantDirty || !!optionValue.trim();
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  async function syncList() {
    try {
      await refresh();
    } catch {
      setNote(
        "Сохранено в Medusa. Список не удалось обновить — обновите страницу позже.",
      );
    }
  }
  async function save(type, payload, section = type) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { product: p } = await post({
        type,
        id,
        version: product.version,
        ...payload,
      });
      apply(p, section);
      setNote("Сохранено в рабочей базе");
      notify("Изменения товара сохранены");
      await syncList();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (
      dirty &&
      !window.confirm(
        "Загрузить свежую карточку? Несохранённые изменения в редакторе будут заменены.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const { product: p } = await liveFetch(
        `/api/live/catalog?id=${encodeURIComponent(id)}`,
      );
      apply(p);
      setNote("Загружена свежая карточка");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    if (mediaDirty) {
      setError("Сначала сохраните порядок фотографий и обложку.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error("Выберите JPG, PNG или WebP до 8 МБ");
      const body = new FormData();
      body.set("id", id);
      body.set("version", product.version);
      body.set("file", file);
      const { product: p } = await liveFetch("/api/live/catalog/upload", {
        method: "POST",
        body,
      });
      apply(p, "media");
      setNote("Фотография загружена и прикреплена к товару");
      notify("Фотография сохранена");
      await syncList();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function move(index, delta) {
    setImages((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  function chooseVariant(v) {
    if (
      variantDirty &&
      !window.confirm("Заменить несохранённые изменения варианта?")
    )
      return;
    setVariant(variantForm(v, product.options));
    setError("");
    setNote("");
  }
  return (
    <Drawer
      title={product ? `Редактирование · ${product.title}` : "Редактор товара"}
      kicker="Каталог"
      wide
      dirty={dirty || busy}
      onClose={busy ? () => {} : onClose}
    >
      {loading ? (
        <p role="status">Загружаем карточку из Medusa…</p>
      ) : !product ? (
        <>
          <FormError>{error}</FormError>
          <Button onClick={reload}>Повторить загрузку</Button>
        </>
      ) : (
        <>
          <div className="catalog-editor-status">
            <Badge
              tone={product.status === "published" ? "positive" : "neutral"}
            >
              {product.status === "published" ? "На витрине" : "Черновик"}
            </Badge>
            <span>{product.collection}</span>
            <Button variant="ghost" disabled={busy} onClick={reload}>
              Загрузить свежую версию
            </Button>
          </div>
          <p className="muted small">
            {product.status === "published"
              ? "Сохранённые изменения этого товара появятся на сайте."
              : "Черновик сохраняется в рабочей базе и не показывается покупателям."}
          </p>
          <Tabs
            items={[
              {
                value: "basics",
                label: "Описание",
                count: basicDirty ? "•" : undefined,
              },
              { value: "media", label: "Фотографии", count: images.length },
              {
                value: "variants",
                label: "Варианты и цены",
                count: product.variants.length,
              },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div aria-live="polite">
            <FormError>{error}</FormError>
            {note && <Notice>{note}</Notice>}
          </div>
          {tab === "basics" && (
            <form
              className="form-stack catalog-editor-section"
              onSubmit={(e) => {
                e.preventDefault();
                save("basics", base);
              }}
            >
              <Field label="Название товара">
                <input
                  required
                  maxLength={180}
                  value={base.title}
                  disabled={busy}
                  onChange={(e) => setBase({ ...base, title: e.target.value })}
                />
              </Field>
              <Field label="Подзаголовок">
                <input
                  maxLength={500}
                  value={base.subtitle}
                  disabled={busy}
                  onChange={(e) =>
                    setBase({ ...base, subtitle: e.target.value })
                  }
                />
              </Field>
              <Field label="Описание">
                <textarea
                  rows={10}
                  maxLength={30000}
                  value={base.description}
                  disabled={busy}
                  onChange={(e) =>
                    setBase({ ...base, description: e.target.value })
                  }
                />
              </Field>
              <div className="form-actions">
                <small className="muted">
                  {basicDirty
                    ? "Есть несохранённые изменения"
                    : "Все изменения описания сохранены"}
                </small>
                <Button
                  type="submit"
                  disabled={busy || !basicDirty}
                  icon={Check}
                >
                  {busy ? "Сохраняем…" : "Сохранить описание"}
                </Button>
              </div>
            </form>
          )}
          {tab === "media" && (
            <div className="form-stack catalog-editor-section">
              <div>
                <input
                  ref={fileInput}
                  className="catalog-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Загрузить фотографию товара"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files[0])}
                />
                <Button
                  disabled={busy || mediaDirty}
                  icon={UploadSimple}
                  onClick={() => fileInput.current?.click()}
                >
                  {busy ? "Сохраняем…" : "Загрузить фотографию"}
                </Button>
                <p className="muted small">
                  JPG, PNG или WebP до 8 МБ. Загрузка сразу прикрепляет фото к
                  общей галерее товара.
                </p>
              </div>
              {product.executionMedia && (
                <Notice>
                  У товара есть фотографии отдельных исполнений. Их привязки
                  сохраняются; защищённые фото нельзя удалить из общей галереи.
                </Notice>
              )}
              {!images.length && (
                <Notice>
                  Фотографий пока нет. Загрузите первое изображение — оно станет
                  главным.
                </Notice>
              )}
              <div className="catalog-photo-list">
                {images.map((img, index) => (
                  <div className="catalog-photo-row" key={img.url}>
                    <div className="catalog-photo-preview">
                      {img.index >= 0 ? (
                        <img
                          alt={`Фотография товара ${index + 1}`}
                          src={workspacePath(
                            `/api/live/media?productId=${encodeURIComponent(id)}&index=${img.index}&v=${product.version}`,
                          )}
                          loading="lazy"
                        />
                      ) : (
                        <Image size={30} />
                      )}
                    </div>
                    <div className="catalog-photo-copy">
                      <b>Фото {index + 1}</b>
                      <small>
                        {thumbnail === img.url
                          ? "Главная фотография"
                          : img.protected
                            ? "Фото исполнения"
                            : "Галерея товара"}
                      </small>
                      <button
                        type="button"
                        disabled={busy || thumbnail === img.url}
                        className="text-button"
                        onClick={() => setThumbnail(img.url)}
                      >
                        {thumbnail === img.url
                          ? "✓ Главное"
                          : "Сделать главным"}
                      </button>
                    </div>
                    <div className="catalog-photo-actions">
                      <Button
                        variant="ghost"
                        disabled={busy || index === 0}
                        aria-label={`Поднять фото ${index + 1}`}
                        onClick={() => move(index, -1)}
                        icon={ArrowUp}
                      />
                      <Button
                        variant="ghost"
                        disabled={busy || index === images.length - 1}
                        aria-label={`Опустить фото ${index + 1}`}
                        onClick={() => move(index, 1)}
                        icon={ArrowDown}
                      />
                      <Button
                        variant="ghost"
                        disabled={busy || img.protected}
                        aria-label={`Убрать фото ${index + 1} из товара`}
                        onClick={() => {
                          setImages(images.filter((i) => i.url !== img.url));
                          if (thumbnail === img.url)
                            setThumbnail(
                              images.find((i) => i.url !== img.url)?.url ||
                                null,
                            );
                        }}
                        icon={Trash}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted small">
                Удаление убирает фото из этой галереи. Порядок и обложка
                применяются после сохранения.
              </p>
              <Button
                disabled={busy || !mediaDirty}
                icon={Check}
                onClick={() =>
                  save("media", { images: images.map((i) => i.url), thumbnail })
                }
              >
                Сохранить фотографии
              </Button>
            </div>
          )}
          {tab === "variants" && (
            <div className="form-stack catalog-editor-section">
              {product.hasMaterialTiers && (
                <Notice>
                  Здесь указана базовая цена исполнения из массива. Цены других
                  материалов рассчитываются по действующим правилам товара.
                </Notice>
              )}
              <div className="catalog-variant-list">
                {product.variants.map((v) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={v.id}
                    className={`catalog-variant-row ${variant?.variantId === v.id ? "selected" : ""}`}
                    onClick={() => chooseVariant(v)}
                  >
                    <span>
                      <b>
                        {v.title === "Default" ? "Базовый вариант" : v.title}
                      </b>
                      <small>
                        {v.sku || "Без артикула"} ·{" "}
                        {Object.values(v.options).map(valueLabel).join(" / ")}
                      </small>
                    </span>
                    <span>
                      {v.price == null
                        ? "Цена не задана"
                        : new Intl.NumberFormat("ru-RU", {
                            style: "currency",
                            currency: "RUB",
                          }).format(v.price)}
                    </span>
                    <PencilSimple size={18} />
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                disabled={busy}
                icon={Plus}
                onClick={() => chooseVariant(null)}
              >
                Добавить вариант
              </Button>
              {variant && (
                <form
                  className="form-stack catalog-variant-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("variant", variant);
                  }}
                >
                  <h3>
                    {variant.variantId
                      ? "Редактирование варианта"
                      : "Новый вариант"}
                  </h3>
                  <Field label="Название варианта">
                    <input
                      required
                      maxLength={180}
                      disabled={busy}
                      value={variant.title}
                      onChange={(e) =>
                        setVariant({ ...variant, title: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Артикул варианта">
                    <input
                      required
                      maxLength={64}
                      disabled={busy}
                      value={variant.sku}
                      onChange={(e) =>
                        setVariant({ ...variant, sku: e.target.value })
                      }
                    />
                  </Field>
                  {product.options.map((o) => (
                    <Field key={o.id} label={optionLabel(o.title)}>
                      <select
                        required
                        disabled={busy}
                        value={variant.options[o.id] || ""}
                        onChange={(e) =>
                          setVariant({
                            ...variant,
                            options: {
                              ...variant.options,
                              [o.id]: e.target.value,
                            },
                          })
                        }
                      >
                        {o.values.map((v) => (
                          <option key={v.id} value={v.value}>
                            {valueLabel(v.value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="Базовая цена, ₽">
                    <input
                      inputMode="decimal"
                      required={!variant.variantId}
                      disabled={busy}
                      value={variant.price}
                      placeholder="Например, 58900"
                      onChange={(e) =>
                        setVariant({
                          ...variant,
                          price: e.target.value,
                          confirmPrice: false,
                        })
                      }
                    />
                  </Field>
                  {originalVariant?.priceError && (
                    <Notice tone="warning">
                      {originalVariant.priceError}. Оставьте цену пустой, чтобы
                      сохранить только название и артикул.
                    </Notice>
                  )}
                  <p className="muted small">
                    Цена указывается в рублях. Пустое поле у существующего
                    варианта сохраняет текущую цену. Прочие валюты и ценовые
                    правила сохраняются.
                  </p>
                  {originalVariant?.price > 0 &&
                    variant.price !== "" &&
                    (Number(variant.price.replace(",", ".")) >
                      originalVariant.price * 3 ||
                      Number(variant.price.replace(",", ".")) <
                        originalVariant.price / 3) && (
                      <label className="catalog-price-confirm">
                        <input
                          type="checkbox"
                          checked={variant.confirmPrice}
                          onChange={(e) =>
                            setVariant({
                              ...variant,
                              confirmPrice: e.target.checked,
                            })
                          }
                        />
                        Подтверждаю изменение цены более чем в три раза: было{" "}
                        {originalVariant.price.toLocaleString("ru-RU")} ₽
                      </label>
                    )}
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !variantDirty ||
                          window.confirm(
                            "Отменить несохранённые изменения варианта?",
                          )
                        )
                          setVariant(null);
                      }}
                    >
                      Отмена
                    </Button>
                    <Button type="submit" disabled={busy} icon={Check}>
                      {busy ? "Сохраняем…" : "Сохранить вариант"}
                    </Button>
                  </div>
                </form>
              )}
              <Section title="Значения для новых вариантов">
                <p className="muted small">
                  Добавьте значение к параметру, затем выберите его в новом
                  варианте. Существующие варианты сохранят свои значения.
                </p>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("option", { optionId, value: optionValue });
                  }}
                >
                  <Field label="Параметр">
                    <select
                      required
                      disabled={busy}
                      value={optionId}
                      onChange={(e) => setOptionId(e.target.value)}
                    >
                      {product.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {optionLabel(o.title)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Новое значение">
                    <input
                      required
                      maxLength={120}
                      disabled={busy}
                      placeholder="Например, 160 × 200 см"
                      value={optionValue}
                      onChange={(e) => setOptionValue(e.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={busy || !optionValue.trim()}
                  >
                    Добавить значение
                  </Button>
                </form>
              </Section>
            </div>
          )}
          <Section title="Видимость на сайте">
            <p className="muted small">
              {product.publishReady
                ? "Обязательные данные заполнены."
                : "Для публикации нужно заполнить:"}
            </p>
            {!product.publishReady && (
              <ul className="catalog-blockers">
                {product.blockers.map((b) => (
                  <li key={b.code}>{b.message}</li>
                ))}
              </ul>
            )}
            <Button
              variant="secondary"
              disabled={
                busy ||
                dirty ||
                (product.status !== "published" && !product.publishReady)
              }
              onClick={() => {
                const type =
                  product.status === "published" ? "hide" : "publish";
                if (
                  window.confirm(
                    type === "publish"
                      ? "Опубликовать товар на сайте?"
                      : "Скрыть товар с сайта и оставить его черновиком?",
                  )
                )
                  save(type, {}, "visibility");
              }}
            >
              {product.status === "published"
                ? "Скрыть с сайта"
                : "Опубликовать товар"}
            </Button>
            {dirty && (
              <p className="muted small">
                Сначала сохраните изменения в открытых блоках.
              </p>
            )}
          </Section>
        </>
      )}
    </Drawer>
  );
}
