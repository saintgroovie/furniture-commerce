/**
 * Guard: Woodright legal-page route wiring (`@/lib/legal/legal-content` +
 * `@/lib/legal/legal-route` is the single SoT - see `launch-config.fidelity.test.ts`
 * for owner-input-field coverage).
 *
 *   yarn dlx tsx src/lib/legal-content.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_PAGE_IDS, buildLegalPage } from "./legal/legal-content"
import { woodrightSeller } from "./legal/woodright-seller"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const FOOTER_LEGAL_SLUGS = [
  "privacy",
  "terms",
  "delivery",
  "payment",
  "returns",
  "warranty",
  "offer",
  "requisites",
  "cookies",
]

assert.deepEqual(
  [...LEGAL_PAGE_IDS].sort(),
  [
    "cookies",
    "delivery",
    "offer",
    "payment",
    "personal-data",
    "privacy",
    "requisites",
    "returns",
    "terms",
    "warranty",
  ].sort()
)

for (const id of LEGAL_PAGE_IDS) {
  const page = buildLegalPage(id)
  assert.equal(page.id, id)
  assert.ok(page.title, `${id}: title required`)
  assert.doesNotMatch(page.title, /подготовка|черновик|Публичная оферта/i, `${id}: no stub or unapproved-offer title`)
  assert.ok(page.lead.length > 0, `${id}: lead required`)
  assert.ok(page.sections.length > 0, `${id}: at least one section required`)
  assert.equal(page.incompleteForPublicLaunch, true, `${id}: legal pack not owner-approved -> incomplete flag`)
}

assert.equal(buildLegalPage("offer").title, "Условия продажи")

for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.match(page, /LegalRoutePage/, `${slug}/page.tsx must use LegalRoutePage`)
  assert.match(page, /legalPageMetadata/, `${slug}/page.tsx must use legalPageMetadata`)
  assert.match(page, new RegExp(`id="${slug}"`), `${slug}/page.tsx must load its own id`)
}

const personalDataPage = read("src/app/personal-data/page.tsx")
assert.match(personalDataPage, /LegalRoutePage/)
assert.match(personalDataPage, /id="personal-data"/)

const copy = read("src/lib/woodright-copy.ts")
for (const slug of FOOTER_LEGAL_SLUGS) {
  assert.match(copy, new RegExp(`href:\\s*"/${slug}"`), `footer must link to /${slug}`)
}

const sellerSrc = read("src/lib/legal/woodright-seller.ts")
assert.match(sellerSrc, new RegExp(woodrightSeller.inn))
assert.match(sellerSrc, new RegExp(woodrightSeller.ogrn))
assert.doesNotMatch(sellerSrc, /40702810|30101810|047003608/)

const legalSrc = read("src/lib/legal/legal-content.ts")
assert.doesNotMatch(legalSrc, /\bИНН\s*:\s*"\d/)
assert.doesNotMatch(legalSrc, /lorem/i)
assert.doesNotMatch(legalSrc, /Публичная оферта/)
assert.doesNotMatch(legalSrc, /Демо Магазин|demostore/i)
assert.doesNotMatch(legalSrc, /Постановление Правительства РФ №\s*55|ПП РФ №\s*55|ПП\s*55/)
assert.doesNotMatch(legalSrc, /гарантия производителя/i)
assert.doesNotMatch(legalSrc, /18 месяцев/)
assert.doesNotMatch(legalSrc, /5 рабочих дней|5 календарных дней/)
assert.doesNotMatch(legalSrc, /мебель возврату не подлежит/i)
assert.doesNotMatch(legalSrc, /гарантия аннулируется/i)
assert.doesNotMatch(legalSrc, /153000/)

function legalPageText(id: (typeof LEGAL_PAGE_IDS)[number]): string {
  const page = buildLegalPage(id)
  return [
    page.title,
    ...page.lead,
    ...page.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
  ].join("\n")
}

const warrantyText = legalPageText("warranty")
assert.match(warrantyText, /12 месяцев/)
assert.match(warrantyText, /с момента передачи товара покупателю/)
assert.match(warrantyText, /ООО «Роэл-Техник»/)
assert.match(warrantyText, /производственн/)
assert.match(warrantyText, /не заменяет обязательные права/)
assert.match(warrantyText, /самостоятельной перевозки/)
assert.match(warrantyText, /не ограничивает обращения по независимым производственным/)
assert.match(warrantyText, /не недостаток сам по себе/)
assert.match(warrantyText, /сервисного обслуживания/)
assert.doesNotMatch(warrantyText, /18 месяцев/)
assert.doesNotMatch(warrantyText, /гарантия производителя/i)
assert.doesNotMatch(warrantyText, /фото обязательн/i)
assert.doesNotMatch(warrantyText, /\bOD-0[0-9]/)

const returnsText = legalPageText("returns")
assert.match(returnsText, /менеджер/i)
assert.match(returnsText, /надлежащего качества/)
assert.match(returnsText, /недостаток/)
assert.match(returnsText, /дистанционн/)
assert.match(returnsText, /7 дней/)
assert.match(returnsText, /3 месяца/)
assert.match(returnsText, /штатной отделки/)
assert.match(returnsText, /не означает автоматический запрет возврата/)
assert.match(returnsText, /может использовать только этот покупатель/)
assert.match(returnsText, /не только личным визитом/)
assert.match(returnsText, /перевозчика или почту/)
assert.match(returnsText, /бесплатный ремонт или возмещение расходов на ремонт/)
assert.match(returnsText, /за счёт продавца/)
assert.match(returnsText, /подходящего аналога нет/)
assert.match(returnsText, /При недостатке это ограничение не действует/)
assert.match(returnsText, /Бумажный чек не обязателен/)
assert.match(returnsText, /Без снимков обращение тоже принимают/)
assert.doesNotMatch(returnsText, /Демо Магазин|demostore/i)
assert.doesNotMatch(returnsText, /Постановление Правительства РФ №\s*55/)
assert.doesNotMatch(returnsText, /Bespoke вернуть нельзя/i)
assert.doesNotMatch(returnsText, /мебель возврату не подлежит/i)
assert.doesNotMatch(returnsText, /\bOD-0[0-9]/)
assert.doesNotMatch(returnsText, /только личным визитом в шоурум/)

const offerText = legalPageText("offer")
assert.match(offerText, /12 месяцев/)
assert.match(offerText, /с момента передачи товара покупателю/)
assert.match(offerText, /ООО «Роэл-Техник»/)
assert.match(offerText, /Ярлык Bespoke/)
assert.doesNotMatch(offerText, /акцепт происходит/)

for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.doesNotMatch(page, /@\/lib\/legal-content"/)
  assert.doesNotMatch(page, /@\/components\/legal-page-layout"/)
}

console.log("legal-content.fidelity: ok")
