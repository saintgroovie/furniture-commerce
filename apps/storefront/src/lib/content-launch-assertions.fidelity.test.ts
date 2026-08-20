/**
 * High-risk buyer-facing content facts for the legal/info launch cycle.
 *
 *   yarn dlx tsx src/lib/content-launch-assertions.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { footer, nav, productTypeBadgeLabels } from "./woodright-copy"
import { LEGAL_PAGE_PATHS, buildLegalPage } from "./legal/legal-content"
import { woodrightSeller } from "./legal/woodright-seller"
import { PRODUCT_TYPE_FILTER_LABELS } from "./catalog-filters"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const COPY_AND_LEGAL = [
  read("src/lib/woodright-copy.ts"),
  read("src/lib/legal/legal-content.ts"),
  read("src/lib/legal/woodright-seller.ts"),
  read("src/lib/legal/owner-inputs.ts"),
].join("\n")

assert.doesNotMatch(COPY_AND_LEGAL, /Демо Магазин/)
assert.doesNotMatch(COPY_AND_LEGAL, /demostore/i)
assert.doesNotMatch(COPY_AND_LEGAL, /18 месяцев/)
assert.doesNotMatch(COPY_AND_LEGAL, /40702810317000020144/)
assert.doesNotMatch(COPY_AND_LEGAL, /30101810300000000608/)
assert.doesNotMatch(COPY_AND_LEGAL, /047003608/)
assert.doesNotMatch(COPY_AND_LEGAL, /под ключ/)
assert.doesNotMatch(COPY_AND_LEGAL, /проекты любой сложности/i)

assert.equal(woodrightSeller.inn, "3702111074")
assert.equal(woodrightSeller.ogrn, "1153702012848")
assert.match(JSON.stringify(buildLegalPage("warranty")), /12 месяцев/)
assert.match(JSON.stringify(buildLegalPage("payment")), /не нужно/)
assert.match(JSON.stringify(buildLegalPage("delivery")), /тарифа нет/)
assert.match(JSON.stringify(buildLegalPage("offer")), /заявка на подтверждение/)
assert.doesNotMatch(JSON.stringify(buildLegalPage("offer")), /акцепт происходит/)
assert.equal(buildLegalPage("offer").title, "Условия продажи")

assert.equal(nav.bespoke, "Bespoke")
assert.equal(productTypeBadgeLabels.BESPOKE, "Bespoke")
assert.equal(PRODUCT_TYPE_FILTER_LABELS.BESPOKE, "Bespoke")

const footerHrefs = footer.columns.flatMap((col) => col.links.map((l) => l.href))
for (const href of [
  "/delivery",
  "/payment",
  "/returns",
  "/warranty",
  "/privacy",
  "/offer",
  "/requisites",
  "/cookies",
  "/bespoke",
  "/designers",
]) {
  assert.ok(footerHrefs.includes(href), `footer missing ${href}`)
}
assert.ok(!footerHrefs.includes("/bespoke/catalog"), "footer must not promote /bespoke/catalog")

assert.doesNotMatch(
  JSON.stringify(buildLegalPage("requisites")),
  /ссылкой на оплату/,
  "requisites must not imply bank details travel with PaymentLink"
)
assert.doesNotMatch(read("src/components/legal-page-view.tsx"), /<main/)
assert.match(read("src/components/bespoke-form.tsx"), /href="\/privacy"/)

const layout = read("src/app/layout.tsx")
assert.doesNotMatch(layout, /\/bespoke\/catalog/)

for (const path of Object.values(LEGAL_PAGE_PATHS)) {
  const rel = `src/app${path}/page.tsx`
  assert.ok(existsSync(join(root, rel)), `missing route file ${rel}`)
}

console.log("content-launch-assertions.fidelity: ok")
