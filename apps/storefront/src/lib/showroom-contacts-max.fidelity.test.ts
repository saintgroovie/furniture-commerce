/**
 * Guard: MAX contact is a direct owner public profile link from SoT.
 * No clipboard / "Скопировать номер" copy-utility contract.
 *
 *   yarn exec tsx src/lib/showroom-contacts-max.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const storefrontRoot = join(srcRoot, "..")

const EXACT_MAX_URL =
  "https://max.ru/u/f9LHodD0cOJ5_V6hgbN0ynWCHmdN5hSOJw23-7TpHcNYdvB-CNqBlw4dsHI"
const TG_URL = "https://t.me/+79672587144"
const WA_URL = "https://wa.me/79672587144"

function read(relFromSrc: string): string {
  return readFileSync(join(srcRoot, relFromSrc), "utf8")
}

function walkTsTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".next-dev") {
        continue
      }
      walkTsTsx(p, acc)
      continue
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) acc.push(p)
  }
  return acc
}

const sot = read("lib/showroom-contacts.ts")
assert.match(sot, /export const MAX_PUBLIC_PROFILE_URL/)
assert.ok(
  sot.includes(EXACT_MAX_URL),
  "SoT must contain exact owner MAX URL"
)
assert.match(
  sot,
  /id:\s*"max"[\s\S]*?href:\s*MAX_PUBLIC_PROFILE_URL/
)
assert.doesNotMatch(sot, /href:\s*null/)

const messengers = read("components/contact-messenger-actions.tsx")
assert.match(messengers, /showroomContacts\.messengers/)
assert.match(messengers, /ContactActionLink/)
assert.match(messengers, /external/)
assert.match(messengers, /contactsCopy\.messengerMaxAria/)
assert.match(messengers, /contactsCopy\.maxWriteValue/)
assert.doesNotMatch(messengers, /MaxContactAction/)
assert.doesNotMatch(messengers, /navigator\.clipboard|execCommand\(["']copy["']\)/)
assert.doesNotMatch(messengers, /Скопировать/)

const page = read("components/contacts-page-layout.tsx")
assert.match(page, /ContactMessengerActions/)
assert.doesNotMatch(page, /MaxContactAction|max\.ru\/u\//)

const dropdownBody = read("components/showroom-contacts-content.tsx")
assert.match(dropdownBody, /ContactMessengerActions/)
assert.match(dropdownBody, /density="dropdown"/)
assert.doesNotMatch(dropdownBody, /MaxContactAction|max\.ru\/u\//)

const copy = read("lib/woodright-copy.ts")
assert.match(copy, /maxWriteValue:\s*"Написать в MAX"/)
assert.match(copy, /messengerMaxAria:\s*"Написать в MAX"/)
assert.doesNotMatch(copy, /Скопировать номер/)
assert.doesNotMatch(copy, /для поиска Woodright в MAX/)
assert.doesNotMatch(copy, /maxCopyValue|maxAriaIdle|maxDropdownCopyValue/)

const action = read("components/contact-action.tsx")
assert.match(action, /target:\s*"_blank"/)
assert.match(action, /rel:\s*"noopener noreferrer"/)
assert.doesNotMatch(action, /ContactActionButton/)

assert.throws(() => {
  readFileSync(join(srcRoot, "components/max-contact-action.tsx"), "utf8")
}, /ENOENT/, "max-contact-action.tsx must be removed")

const icons = read("components/contact-action-icons.tsx")
assert.doesNotMatch(icons, /ContactCopyIcon|ContactCheckIcon/)

// Telegram / WhatsApp URLs unchanged in SoT
assert.ok(sot.includes(TG_URL) || sot.includes("`https://t.me/+${MESSENGER_E164_DIGITS}`"))
assert.ok(sot.includes(WA_URL) || sot.includes("`https://wa.me/${MESSENGER_E164_DIGITS}`"))
assert.match(sot, /MESSENGER_E164_DIGITS\s*=\s*"79672587144"/)

// Desktop/mobile parity: single messenger component for page + dropdown
assert.match(messengers, /density === "dropdown"/)
assert.match(messengers, /density="page"|density === "page"|density = "page"/)

// No duplicate hardcoded MAX URLs outside SoT (+ this fidelity test)
const hardcodedHits: string[] = []
for (const file of walkTsTsx(join(storefrontRoot, "src"))) {
  const rel = relative(storefrontRoot, file)
  if (rel.endsWith("showroom-contacts.ts")) continue
  if (rel.endsWith("showroom-contacts-max.fidelity.test.ts")) continue
  const text = readFileSync(file, "utf8")
  if (text.includes("max.ru/u/f9LHodD0cOJ5")) {
    hardcodedHits.push(rel)
  }
  if (
    text.includes("Скопировать номер") ||
    text.includes("для поиска Woodright в MAX")
  ) {
    assert.fail(`old MAX copy text remains in ${rel}`)
  }
  if (
    /clipboard\.writeText|document\.execCommand\(["']copy["']\)/.test(text) &&
    /max|MAX/.test(text) &&
    rel.includes("contact")
  ) {
    assert.fail(`MAX clipboard handler remains in ${rel}`)
  }
}
assert.deepEqual(
  hardcodedHits,
  [],
  `duplicate MAX URL outside SoT: ${hardcodedHits.join(", ") || "(none)"}`
)

// Mobile nav + contacts page mount shared SoT consumers
const mobileNav = read("components/mobile-nav.tsx")
assert.match(mobileNav, /ShowroomContactsContent|contacts/)

const contactsPage = read("app/contacts/page.tsx")
assert.match(contactsPage, /ContactsPageLayout/)

console.log("showroom-contacts-max.fidelity.test.ts: ok")
