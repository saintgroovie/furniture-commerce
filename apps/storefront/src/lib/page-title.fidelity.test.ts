/**
 * Static page titles never double the brand; legal meta descriptions are sentences.
 *   yarn dlx tsx src/lib/page-title.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { joinMetaSentences, pageTitle } from "./page-title"
import { seo } from "./woodright-copy"

const ROOT_TEMPLATE = (t: string) => `${t} | Woodright`

function rendered(title: string): string {
  const t = pageTitle(title)
  return typeof t === "object" && t && "absolute" in t ? String(t.absolute) : ROOT_TEMPLATE(String(t))
}

for (const [key, entry] of Object.entries(seo)) {
  const title = (entry as { title?: unknown }).title
  if (typeof title !== "string") continue
  const out = rendered(title)
  assert.equal((out.match(/Woodright/g) ?? []).length >= 1, true, `${key}: brand present`)
  assert.doesNotMatch(out, /Woodright.*\| Woodright$/u, `${key}: no doubled brand tail («${out}»)`)
}

assert.deepEqual(pageTitle("Контакты Woodright"), { absolute: "Контакты Woodright" })
assert.equal(pageTitle("Доставка"), "Доставка")

/* Source lock: top-level `title: seo.<key>.title` with a branded string must go through pageTitle. */
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/(page|layout)\.tsx$/.test(name)) acc.push(p)
  }
  return acc
}
const branded = new Set(
  Object.entries(seo)
    .filter(([, e]) => typeof (e as { title?: unknown }).title === "string" && /Woodright/.test((e as { title: string }).title))
    .map(([k]) => k)
)
for (const file of walk(join(__dirname, "..", "app"))) {
  const src = readFileSync(file, "utf8")
  for (const m of src.matchAll(/^ {2}title: seo\.(\w+)\.title,$/gm)) {
    assert.ok(!branded.has(m[1]!), `${file}: wrap seo.${m[1]}.title in pageTitle()`)
  }
}

assert.equal(
  joinMetaSentences([
    "Стоимость и условия доставки зависят от адреса и состава заказа",
    "После оформления менеджер проверит детали и согласует условия до оплаты",
  ]),
  "Стоимость и условия доставки зависят от адреса и состава заказа. После оформления менеджер проверит детали и согласует условия до оплаты."
)
assert.equal(joinMetaSentences(["Уже с точкой.", " ", "Вопрос?"]), "Уже с точкой. Вопрос?")

console.log("page-title fidelity: ok")
