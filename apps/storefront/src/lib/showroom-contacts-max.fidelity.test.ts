/**
 * Guard: MAX contact is a direct owner public profile link from SoT.
 * No clipboard / "Скопировать номер" copy-utility contract.
 * Presentation: dropdown = name-only; page = «Написать в» + service name.
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
assert.match(messengers, /contactsCopy\.messengerWriteKicker/)
assert.match(messengers, /item\.label/)
assert.doesNotMatch(messengers, /maxWriteValue|messengerWriteValue/)
assert.doesNotMatch(messengers, /MaxContactAction/)
assert.doesNotMatch(messengers, /navigator\.clipboard|execCommand\(["']copy["']\)/)
assert.doesNotMatch(messengers, /Скопировать/)
assert.doesNotMatch(messengers, /max\.ru\/u\//)

// Dropdown presentation: service name only (no visible «Написать в»)
const dropStart = messengers.indexOf('density === "dropdown"')
assert.ok(dropStart >= 0, "dropdown density branch required")
const dropReturn = messengers.indexOf("return (", dropStart)
const pageReturn = messengers.indexOf("return (", dropReturn + 1)
assert.ok(dropReturn >= 0 && pageReturn > dropReturn, "page/dropdown returns required")
const dropdownBranch = messengers.slice(dropStart, pageReturn)
const pageBranch = messengers.slice(pageReturn)
assert.match(dropdownBranch, /item\.label/)
assert.match(dropdownBranch, /contact-action-copy--single/)
assert.doesNotMatch(dropdownBranch, /messengerWriteKicker/)
assert.doesNotMatch(dropdownBranch, /contact-action-kicker/)

// Page presentation: kicker «Написать в» + large service label
assert.match(pageBranch, /messengerWriteKicker/)
assert.match(pageBranch, /contact-action-kicker/)
assert.match(pageBranch, /contact-action-value/)
assert.match(pageBranch, /item\.label/)
assert.doesNotMatch(pageBranch, /maxWriteValue|messengerWriteValue|"Написать в MAX"/)

const page = read("components/contacts-page-layout.tsx")
assert.match(page, /ContactMessengerActions/)
assert.doesNotMatch(page, /MaxContactAction|max\.ru\/u\//)

const dropdownBody = read("components/showroom-contacts-content.tsx")
assert.match(dropdownBody, /ContactMessengerActions/)
assert.match(dropdownBody, /density="dropdown"/)
assert.doesNotMatch(dropdownBody, /MaxContactAction|max\.ru\/u\//)

const copy = read("lib/woodright-copy.ts")
assert.match(copy, /messengerWriteKicker:\s*"Написать в"/)
assert.match(copy, /messengerMaxAria:\s*"Написать в MAX"/)
assert.match(copy, /messengerTelegramAria:\s*"Написать в Telegram"/)
assert.match(copy, /messengerWhatsappAria:\s*"Написать в WhatsApp"/)
assert.doesNotMatch(copy, /maxWriteValue|messengerWriteValue/)
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

// Dropdown messenger row: content-weighted columns (not equal 1fr trio on desktop)
const css = read("app/globals.css")
const trioBlock = css.match(/\.contact-dropdown-channel-trio\s*\{[^}]*\}/)
assert.ok(trioBlock, "dropdown channel trio rule required")
assert.doesNotMatch(
  trioBlock[0],
  /grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/
)
const trioCols = trioBlock[0].match(
  /grid-template-columns:\s*minmax\(\s*0\s*,\s*([\d.]+)fr\s*\)\s+minmax\(\s*0\s*,\s*([\d.]+)fr\s*\)\s+minmax\(\s*0\s*,\s*([\d.]+)fr\s*\)/
)
assert.ok(trioCols, "desktop trio must declare three weighted minmax(0, Nfr) tracks")
const telegramFr = Number(trioCols[1])
const whatsappFr = Number(trioCols[2])
const maxFr = Number(trioCols[3])
assert.ok(whatsappFr > telegramFr, "WhatsApp grid weight must exceed Telegram")
assert.ok(maxFr < telegramFr, "MAX grid weight must be below Telegram")
assert.ok(
  whatsappFr / telegramFr >= 1.1 && whatsappFr / telegramFr <= 1.18,
  `WhatsApp should be ~10–18% wider than Telegram (got ${whatsappFr}/${telegramFr})`
)
assert.ok(
  maxFr / telegramFr >= 0.75 && maxFr / telegramFr <= 0.85,
  `MAX should be ~15–25% narrower than Telegram (got ${maxFr}/${telegramFr})`
)
// Narrow breakpoint may still use equal columns for clip safety
assert.match(css, /Narrow shells:\s*fall back to equal columns/)
// Page `/contacts` messenger grid stays equal three columns (unchanged presentation)
assert.match(
  css,
  /\.contact-action-grid--channels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/
)
// Layout polish: shared fixed inner grids centered in each cell/card
// (not auto-sized max-content clusters that shift icon/text axes per label).
assert.match(
  css,
  /\.contacts-nav-dropdown-menu a\.contact-action\.contact-action--density-dropdown\.contact-dropdown-channel-link,\s*\.showroom-contacts--contacts\s+a\.contact-action\.contact-action--density-dropdown\.contact-dropdown-channel-link\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*18px\s+92px[^}]*gap:\s*0\s+0\.625rem[^}]*justify-content:\s*center/
)
assert.match(
  css,
  /\.contact-action\.contact-action--density-page\.contact-action--channel\.contact-action--layout-leading\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*20px\s+132px[^}]*gap:\s*0\s+0\.625rem[^}]*justify-content:\s*center/
)
assert.match(
  css,
  /\.contact-dropdown-channel-link \.contact-action-line\s*\{[^}]*white-space:\s*nowrap/
)
// Dropdown text column fills fixed track - no max-content cluster sizing
const dropBodyBlock = css.match(
  /\.contact-dropdown-channel-link \.contact-action-body,\s*\.contact-dropdown-channel-link \.contact-action-copy,\s*\.contact-dropdown-channel-link \.contact-action-copy--single\s*\{[^}]*\}/
)
assert.ok(dropBodyBlock, "dropdown channel body/copy rule required")
assert.doesNotMatch(dropBodyBlock[0], /width:\s*max-content/)
assert.match(dropBodyBlock[0], /width:\s*100%/)
assert.match(dropBodyBlock[0], /text-align:\s*left/)
// Page messenger copy: fixed column, left-aligned kicker+name (no max-content)
const pageCopyBlock = css.match(
  /\.contact-action--density-page\.contact-action--channel \.contact-action-copy\s*\{[^}]*\}/
)
assert.ok(pageCopyBlock, "page channel copy rule required")
assert.doesNotMatch(pageCopyBlock[0], /width:\s*max-content/)
assert.match(pageCopyBlock[0], /width:\s*100%/)
assert.match(pageCopyBlock[0], /text-align:\s*left/)
assert.match(pageCopyBlock[0], /flex-direction:\s*column/)
const pageBodyBlock = css.match(
  /\.contact-action--density-page\.contact-action--channel \.contact-action-body\s*\{[^}]*\}/
)
assert.ok(pageBodyBlock, "page channel body rule required")
assert.doesNotMatch(pageBodyBlock[0], /width:\s*max-content/)
assert.match(pageBodyBlock[0], /width:\s*100%/)
// Fixed icon slots (shared across services - not per-label offsets)
assert.match(
  css,
  /\.contact-dropdown-channel-link \.contact-action-icon:not\(\.contact-action-icon--bubble\)\s*\{[^}]*width:\s*18px[^}]*height:\s*18px[^}]*place-items:\s*center/
)
assert.match(
  css,
  /\.contact-action--density-page\.contact-action--channel \.contact-action-icon:not\(\.contact-action-icon--bubble\)\s*\{[^}]*width:\s*20px[^}]*height:\s*20px[^}]*place-items:\s*center/
)
assert.ok(
  whatsappFr > telegramFr && telegramFr > maxFr,
  "expected WhatsApp > Telegram > MAX grid weights"
)
// Compact shell lock (merged PR #156): ~596px - never desktop width:100%
const contactsShellBlocks = [
  ...css.matchAll(/\.header-info-dropdown--contacts\s*\{[^}]*\}/g),
].map((m) => m[0])
assert.ok(contactsShellBlocks.length >= 1, "contacts shell rule required")
const desktopShell = contactsShellBlocks.find((block) =>
  /(?:^|[;{\n])\s*width:\s*596px/.test(block)
)
assert.ok(desktopShell, "desktop contacts shell must declare width: 596px")
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*100%/)
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*min\(\s*100%/)
assert.match(desktopShell, /max-width:\s*min\(\s*596px/)
assert.doesNotMatch(
  css,
  /\.header-info-dropdown--contacts\s*\{[^}]*(?:^|[;{\n])\s*width:\s*(?:368|400)px/
)

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
