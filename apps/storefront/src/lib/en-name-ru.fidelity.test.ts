/**
 * Buyer-facing EN name map (transcription + owner meaning).
 * Run from apps/storefront:
 *   npx tsx src/lib/en-name-ru.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { layoutBuyerFacingTitle, transcribeEnNamesInRuText } from "./en-name-ru"

const pairs: Array<[string, string]> = [
  // Greenwich models
  ["Прикроватная тумба Hole", "Прикроватная тумба Хоул"],
  ["Прикроватная тумба Stone", "Прикроватная тумба Стоун"],
  ["Комод Scale", "Комод Скейл"],
  ["Консоль Step", "Консоль Степ"],
  ["Тумба ТВ Wide", "Тумба ТВ Уайд"],
  ["Шкаф-витрина Cristal", "Шкаф-витрина Кристалл"],
  ["Гардероб Level", "Гардероб Левел"],
  ["Гардероб Total", "Гардероб Тотал"],
  ["Рабочий стол Base", "Рабочий стол Бейс"],
  // WW meaning + locked transcription
  ["Комод высокий Teddy Bear (гл. 560)", "Комод высокий Плюшевый мишка (гл. 560)"],
  ["Стеллаж для книг Rural Scenery высокий", "Стеллаж для книг Сельский пейзаж высокий"],
  ["Комод высокий Fairies (гл. 560)", "Комод высокий Феи (гл. 560)"],
  ["Комод высокий Fantasy Kingdom (гл. 560)", "Комод высокий Сказочное королевство (гл. 560)"],
  ["Комод стандартный Ant's Village (гл. 440)", "Комод стандартный Деревня муравьев (гл. 440)"],
  ["Комод стандартный Ant`s Village (гл. 440)", "Комод стандартный Деревня муравьев (гл. 440)"],
  ["Комод высокий Royal Lilies (гл. 440)", "Комод высокий Королевские лилии (гл. 440)"],
  ["Столик детский Sweet Home", "Столик детский Милый дом"],
  ["Комод высокий Templars (гл. 440)", "Комод высокий Рыцари (гл. 440)"],
  ["Комод высокий Ballet (гл. 440)", "Комод высокий Балет (гл. 440)"],
  ["Комод высокий Pastoral (гл. 560)", "Комод высокий Полевые цветы (гл. 560)"],
  ["Комод высокий Tiggy-Winkle (гл. 560)", "Комод высокий Ежик (гл. 560)"],
  ["Стол рабочий Infanta", "Стол рабочий Инфанта"],
  ["Столик детский Molly", "Столик детский Молли"],
  ["Стеллаж для книг Tommy высокий", "Стеллаж для книг Томми высокий"],
]

for (const [raw, expected] of pairs) {
  assert.equal(layoutBuyerFacingTitle(raw).text, expected, raw)
}

const phrasePairs: Array<[string, string]> = [
  ["Princess Rose", "Принцесса Роза"],
  ["Brigantine Blue", "Бригантина"],
  ["Brigantine Ivory", "Бригантина"],
  ["Willie Winkie", "Вилли Винки"],
  ["Monchelsea", "Мончелси"],
  ["Country", "Кантри"],
  ["Alice", "Алиса"],
  ["Albion", "Альбион"],
  ["Royal Guardsmen", "Королевская стража"],
  ["Black Isle", "Чёрный остров"],
  ["Frame", "Фрейм"],
  ["Cloud", "Клауд"],
  ["Plane", "Плейн"],
  ["Woodright", "Woodright"],
]

for (const [raw, expected] of phrasePairs) {
  assert.equal(transcribeEnNamesInRuText(raw), expected, raw)
}

assert.doesNotMatch(transcribeEnNamesInRuText("Ballet"), /Баллет/)
assert.doesNotMatch(transcribeEnNamesInRuText("Wide"), /Вид/)

const leftover = layoutBuyerFacingTitle("Стеллаж для книг Ballet (гл. 440)")
assert.doesNotMatch(leftover.text, /Баллет/)
assert.match(leftover.text, /Балет/)

const cleaned = layoutBuyerFacingTitle("Стеллаж для книг")
assert.equal(cleaned.text, "Стеллаж для книг")

console.log("en-name-ru.fidelity.test.ts: ok")
