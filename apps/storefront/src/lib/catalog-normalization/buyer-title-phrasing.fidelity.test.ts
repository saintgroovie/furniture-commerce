/**
 * Buyer title phrasing v4 — natural order, collection model, desk codes.
 *   yarn dlx tsx src/lib/catalog-normalization/buyer-title-phrasing.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  phraseBuyerTitle,
  repairLegacyTitleNoise,
  resolvePublicProductTitle,
  resolveTitleCollectionSlug,
  SINGLE_PEDESTAL_DESK_CODE_MAP,
} from "./index"

const t = (raw: string, slug: string | null) => phraseBuyerTitle(raw, slug).title

/* Abbreviations → full words, adjective first, model after the type. */
assert.equal(t("Кровать 1-сп. (90 × 190)", "oliver"), "Односпальная кровать Оливер (90 × 190)")
assert.equal(t("Кровать 1,5-сп. (120 × 190) без изножья", "provence"), "Полутораспальная кровать Прованс (120 × 190) без изножья")
assert.equal(t("Кровать 2-сп. (180 × 200)", "monchelsea"), "Двуспальная кровать Мончелси (180 × 200)")
assert.equal(t("Шкаф для одежды 2-дв", "oliver"), "Двухдверный шкаф для одежды Оливер")
assert.equal(t("Шкаф для одежды 2-дв. высокий", "willie-winkie"), "Высокий двухдверный шкаф для одежды Вилли Винки")
assert.equal(t("Комод высокий", "oliver"), "Высокий комод Оливер")
assert.equal(t("Тумбочка прикроватная с дверкой", "oliver"), "Прикроватная тумба Оливер с дверкой")
assert.equal(t("Кроватка приставная + матрас", "oliver"), "Приставная кроватка Оливер с матрасом")
assert.equal(t("Этажерка малая 3 полки", "provence"), "Малая этажерка Прованс, 3 полки")
assert.equal(t("Столик чайный круглый", "oliver"), "Круглый чайный столик Оливер")
assert.equal(t("Кровать - трансформер (80 × 150) с рисунком", "princess-rose"), "Кровать-трансформер Принцесса Роза (80 × 150) с рисунком")
assert.equal(t("Нижняя кровать без матраса увеличенная (120 × 185)", "oxford"), "Увеличенная нижняя кровать Оксфорд без матраса (120 × 185)")

/* Single-pedestal desk codes (pedestal_filling evidence: pv-65-5…8, co-65-1/2). */
assert.equal(t("Стол письменный 1-тумб. Я0", "provence"), "Однотумбовый письменный стол Прованс (тумба с ящиками слева)")
assert.equal(t("Стол письменный 1-тумб. 0П", "country"), "Однотумбовый письменный стол Кантри (тумба с полками справа)")
assert.equal(SINGLE_PEDESTAL_DESK_CODE_MAP["0Я"].public_phrase, "тумба с ящиками справа")
assert.equal(t("Стол письменный 1-тумб. Я0", "provence"), t("Стол письменный 1-тумб. ЯO", "provence"), "Latin O as zero")
assert.equal(
  t("Стол письменный 1-тумб. 0Я (ручки Сваровски)", "princess-rose"),
  "Однотумбовый письменный стол Принцесса Роза (тумба с ящиками справа, ручки Сваровски)",
  "a Latin/brand word inside the handle note is not a model name"
)
assert.equal(
  t("Стол письменный 2-тумб. ПЯ (ручки Сваровски)", "princess-rose"),
  "Двухтумбовый письменный стол Принцесса Роза (полки слева, ящики справа, ручки Сваровски)"
)

/* Model already named → no second model; Greenwich nicknames stay. */
assert.equal(t("Гардероб 2-дв. с ящиками Левел", "greenwich"), "Двухдверный гардероб с ящиками Левел")
assert.equal(t("Комод Скейл", "greenwich"), "Комод Скейл")
assert.equal(t("Комплекс Оксфорд-1 (нижняя кровать без матраса 90 × 185)", "oxford"), "Комплекс Оксфорд-1 (нижняя кровать без матраса 90 × 185)")

/* Unknown meaning stays verbatim (Monchelsea module codes are HOLD). */
assert.equal(t("Шкаф для одежды 2-дв. (модуль/ЯШ)", "monchelsea"), "Двухдверный шкаф для одежды Мончелси (модуль/ЯШ)")

/* Idempotent: phrasing an already phrased title changes nothing. */
for (const [raw, slug] of [
  ["Кровать 1-сп. (90 × 190) без изножья", "provence"],
  ["Стол письменный 1-тумб. Я0", "provence"],
  ["Кроватка приставная + матрас", "oliver"],
  ["Комод высокий", "willie-winkie"],
] as const) {
  const once = t(raw, slug)
  assert.equal(t(once, slug), once, `idempotent: ${raw}`)
}

/* Dictionary rules end on a token boundary; unknown longer words stay intact. */
assert.equal(t("Кровать 1-спальная", "oliver"), "Кровать Оливер, 1-спальная")
assert.doesNotMatch(t("Кровать 1-спальная", "oliver"), /Оливер альная|^Односпальная кровать/)
assert.equal(t("Комод высокийй", null), "Комод высокийй")
assert.equal(t("Стол письменный1", "oliver"), "Стол письменный1 Оливер")

/* No collection → no invented model; empty input is fail-safe. */
assert.equal(t("Комод высокий", null), "Высокий комод")
assert.equal(t("", "oliver"), "")
assert.equal(t("   ", null).trim(), "")

/* Legacy noise repair. */
assert.equal(repairLegacyTitleNoise("Кровать 1-сп. (90*190) с рисунком, без изн."), "Кровать 1-сп. (90*190) с рисунком, без изножья")
assert.equal(repairLegacyTitleNoise("Кровать 1,5-сп. 120×190"), "Кровать 1,5-сп. (120×190)")
assert.match(repairLegacyTitleNoise("Комод,белый"), /Комод, белый/)
assert.match(repairLegacyTitleNoise("Кровать 1,5-сп."), /1,5-сп/, "decimal comma is not split")

/* Collection slug resolution order: metadata → family_key → handle prefix. */
assert.equal(resolveTitleCollectionSlug("ol-05-3", { collection: "provence" }), "provence")
assert.equal(resolveTitleCollectionSlug("pv-05-2", {}), "provence")
assert.equal(resolveTitleCollectionSlug("greenwich-gr-05-1", {}), "greenwich")
assert.equal(resolveTitleCollectionSlug("zz-99", {}), null)

/* Resolver: SKU never leaks; stored owner public_title is not rephrased. */
{
  const r = resolvePublicProductTitle({
    handle: "ol-05-3",
    title: "Комод высокий",
    metadata: { collection: "oliver", sku: "OL-05-3" },
  })
  assert.equal(r.public_title, "Высокий комод Оливер")
  assert.doesNotMatch(r.public_title, /OL-05|ol-05/i)
}
{
  const stored = resolvePublicProductTitle({
    handle: "ol-05-3",
    title: "Комод высокий",
    metadata: { collection: "oliver", public_title: "Комод высокий" },
  })
  assert.equal(stored.public_title, "Комод высокий", "owner override is not rephrased")
  for (const override of ["Кровать 90×190", "Шкаф 2-дв. (модуль/Ш)", "Комод Oliver"]) {
    const r = resolvePublicProductTitle({ handle: "ol-14-1", title: "x", metadata: { collection: "oliver", public_title: override } })
    assert.equal(r.public_title, override, `override kept: ${override}`)
  }
}

console.log("buyer-title-phrasing fidelity: ok")
