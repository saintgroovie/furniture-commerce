/**
 * PASS F: contextual localization — UI chrome «Kids»/«KIDS» → «Детская».
 * Proper names Greenwich / Cloud / Woodright Kids in product copy stay Latin.
 *
 *   yarn exec tsx src/lib/pass-f-kids-chrome-localization.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const header = read("src/components/header-logo.tsx")
assert.match(header, /logo-kids-badge">Детская</)
assert.doesNotMatch(header, /logo-kids-badge">Kids</)
assert.match(header, /Woodright Kids/)

const footer = read("src/components/site-footer.tsx")
assert.match(footer, /logo-kids-badge">Детская</)
assert.doesNotMatch(footer, /logo-kids-badge">Kids</)

const css = read("src/app/globals.css")
assert.match(css, /--logo-kids-w:\s*4\.75rem/)
assert.match(css, /\.logo-kids-badge\s*\{[^}]*text-transform:\s*none/s)

const nav = read("src/lib/woodright-copy.ts")
assert.match(nav, /kids:\s*"Детская"/)

const en = read("src/lib/en-name-ru.ts")
assert.match(en, /Woodright Kids/)
assert.match(en, /greenwich:\s*"Гринвич"/)
assert.match(en, /\bCloud\b|cloud/i)

/* Proper collection names must remain in source (KEEP). */
const craft = read("src/components/home/home-craft.tsx")
assert.match(craft, /Greenwich/)
assert.doesNotMatch(craft, /logo-kids-badge/)

console.log("pass-f-kids-chrome-localization.fidelity: ok")
