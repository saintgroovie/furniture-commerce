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
  maxFr / telegramFr >= 0.75 && maxFr / telegramFr <= 0.82,
  `MAX should be ~18–25% narrower than Telegram (got ${maxFr}/${telegramFr})`
)
// Page `/contacts` messenger grid stays equal three columns
assert.match(
  css,
  /\.contact-action-grid--channels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/
)
// Phone pair outer grid: equal two columns
assert.match(
  css,
  /\.contact-action-grid--pair\s*\{[\s\S]*?grid-template-columns:\s*repeat\(\s*2\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/
)

// Dropdown: compact inline-flex cluster, 16px icon, CSS gap ≤7px (no fixed text column)
const dropLinkBlock = css.match(
  /\.contacts-nav-dropdown-menu a\.contact-action\.contact-action--density-dropdown\.contact-dropdown-channel-link,\s*\.showroom-contacts--contacts\s+a\.contact-action\.contact-action--density-dropdown\.contact-dropdown-channel-link\s*\{[^}]*\}/
)
assert.ok(dropLinkBlock, "dropdown channel link rule required")
assert.match(dropLinkBlock[0], /display:\s*inline-flex/)
assert.match(dropLinkBlock[0], /justify-content:\s*center/)
assert.match(dropLinkBlock[0], /column-gap:\s*0\.4375rem/) // 7px (≤7px CSS gap band)
assert.doesNotMatch(dropLinkBlock[0], /grid-template-columns:\s*18px\s+92px/)
assert.doesNotMatch(dropLinkBlock[0], /grid-template-columns:\s*18px\s+max-content/)
assert.doesNotMatch(css, /grid-template-columns:\s*18px\s+92px/)
assert.match(
  css,
  /\.contact-dropdown-channel-link \.contact-action-line\s*\{[^}]*white-space:\s*nowrap/
)
const dropBodyBlock = css.match(
  /\.contact-dropdown-channel-link \.contact-action-body,\s*\.contact-dropdown-channel-link \.contact-action-copy,\s*\.contact-dropdown-channel-link \.contact-action-copy--single\s*\{[^}]*\}/
)
assert.ok(dropBodyBlock, "dropdown channel body/copy rule required")
assert.doesNotMatch(dropBodyBlock[0], /width:\s*100%/)
assert.match(dropBodyBlock[0], /width:\s*auto/)
assert.match(dropBodyBlock[0], /flex:\s*0\s+0\s+auto/)
assert.match(dropBodyBlock[0], /text-align:\s*left/)
assert.match(
  css,
  /\.contact-dropdown-channel-link \.contact-action-icon:not\(\.contact-action-icon--bubble\)\s*\{[^}]*(?:width|inline-size):\s*16px/
)
assert.match(
  messengers,
  /DROPDOWN_MESSENGER_ICON\s*=\s*16/
)

// Focus uses outline (bbox-stable) - no border-width bump on :focus
assert.match(css, /\.contact-action:focus-visible\s*\{[^}]*outline:\s*2px/)
assert.doesNotMatch(
  css,
  /\.contact-action(?:--density-page)?(?:\.contact-action--phone)?:focus(?:-visible)?\s*\{[^}]*border(?:-width)?:\s*2px/
)

/*
  /contacts ALL page-action cards share one 72px left-axis contract
  (showroom phone+map, channels primary phones, messengers).
*/
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-height:\s*72px/
)
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-pad-inline:\s*1\.125rem/
)
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-pad-block:\s*0\.625rem/
)
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-icon:\s*18px/
)
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-gap:\s*0\.75rem/
)
assert.match(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-text-gap:\s*0\.125rem/
)
assert.doesNotMatch(
  css,
  /\.contacts-page\s*\{[^}]*--contacts-page-action-height:\s*88px/
)
const equalPageAction = css.match(
  /\.contacts-page \.contact-action\.contact-action--density-page\.contact-action--layout-leading\s*\{[^}]*\}/
)
assert.ok(equalPageAction, "equal page-action geometry rule required")
assert.match(equalPageAction[0], /display:\s*grid/)
assert.match(
  equalPageAction[0],
  /grid-template-columns:\s*var\(\s*--contacts-page-action-icon\s*\)\s+minmax\(\s*0\s*,\s*1fr\s*\)/
)
assert.match(
  equalPageAction[0],
  /min-height:\s*var\(\s*--contacts-page-action-height\s*\)/
)
assert.match(
  equalPageAction[0],
  /(?:^|[;{\n])\s*height:\s*var\(\s*--contacts-page-action-height\s*\)/
)
assert.match(equalPageAction[0], /align-items:\s*center/)
assert.doesNotMatch(equalPageAction[0], /justify-content:\s*center/)
assert.doesNotMatch(equalPageAction[0], /grid-template-columns:\s*20px\s+132px/)
assert.doesNotMatch(css, /grid-template-columns:\s*20px\s+132px/)
assert.doesNotMatch(
  equalPageAction[0],
  /min-height:\s*(?:88px|4\.375rem|4rem)/
)
assert.match(
  css,
  /\.contacts-page \.contact-action-grid--page,\s*\.contacts-page \.contact-action-grid--channels\s*\{[^}]*min-height:\s*var\(\s*--contacts-page-action-height\s*\)/
)
assert.match(
  css,
  /\.contacts-page \.contact-action-grid--page,\s*\.contacts-page \.contact-action-grid--channels\s*\{[^}]*gap:\s*var\(\s*--contacts-page-action-row-gap\s*\)/
)
assert.ok(
  whatsappFr > telegramFr && telegramFr > maxFr,
  "expected WhatsApp > Telegram > MAX grid weights"
)

// Compact shell: exact owner desktop width 368px (PR #153 baseline) - never 500/596
const contactsShellBlocks = [
  ...css.matchAll(/\.header-info-dropdown--contacts\s*\{[^}]*\}/g),
].map((m) => m[0])
assert.ok(contactsShellBlocks.length >= 1, "contacts shell rule required")
const desktopShell = contactsShellBlocks.find((block) =>
  /(?:^|[;{\n])\s*width:\s*368px/.test(block)
)
assert.ok(desktopShell, "desktop contacts shell must declare width: 368px")
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*100%/)
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*min\(\s*100%/)
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*max-content/)
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*500px/)
assert.doesNotMatch(desktopShell, /(?:^|[;{\n])\s*width:\s*596px/)
assert.match(desktopShell, /max-width:\s*calc\(\s*100vw\s*-\s*24px\s*\)/)
assert.doesNotMatch(desktopShell, /min-width:\s*(?:500|596)px/)
// No later contacts-shell override to percentage / 500 / 596
for (const block of contactsShellBlocks) {
  assert.doesNotMatch(block, /(?:^|[;{\n])\s*width:\s*min\(\s*100%/)
  assert.doesNotMatch(block, /(?:^|[;{\n])\s*width:\s*(?:500|596)px/)
}
// Explicit lock: cannot silently reintroduce 500px shell
assert.match(
  css,
  /\.header-info-dropdown--contacts\s*\{[^}]*(?:^|[;{\n])\s*width:\s*368px/
)
assert.doesNotMatch(
  css,
  /\.header-info-dropdown--contacts\s*\{[^}]*(?:^|[;{\n])\s*width:\s*(?:368|400|500|596)px[^}]*width:\s*500px/
)
// Weighted trio must not be replaced by equal 1fr×3
assert.doesNotMatch(
  css,
  /\.contact-dropdown-channel-trio\s*\{[^}]*grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/
)
assert.doesNotMatch(
  css,
  /\.header-info-dropdown--contacts\s*\{[^}]*(?:^|[;{\n])\s*width:\s*(?:400|500|596)px/
)
// Grid items cannot inflate shell
assert.match(
  css,
  /\.contact-dropdown-channel-trio \.contact-action-grid-item\s*\{[^}]*min-width:\s*0/
)
assert.match(css, /\.contact-dropdown-channel-trio\s*\{[^}]*width:\s*100%/)
assert.match(css, /\.contact-dropdown-channel-trio\s*\{[^}]*min-width:\s*0/)
// Ban contacts shell 500/596 specifically (not unrelated page clamps)
assert.doesNotMatch(
  css,
  /\.header-info-dropdown--contacts[^{]*\{[^}]*(?:^|[;{\n])\s*width:\s*(?:500|596)px/
)

// Vertical rhythm lock from baseline 9b650856 (shell height ~273)
assert.match(
  css,
  /\.showroom-contacts--showroom,\s*\.showroom-contacts--contacts\s*\{[^}]*--hc-pad:\s*1\.3125rem/
)
assert.match(
  css,
  /\.showroom-contacts--showroom,\s*\.showroom-contacts--contacts\s*\{[^}]*--hc-gap-section:\s*1\.0625rem/
)
assert.match(
  css,
  /\.showroom-contacts--showroom,\s*\.showroom-contacts--contacts\s*\{[^}]*--hc-gap-after-divider:\s*0\.875rem/
)
assert.match(
  css,
  /\.showroom-contacts--showroom \.showroom-contacts-title,\s*\.showroom-contacts--contacts \.showroom-contacts-title\s*\{[^}]*font-size:\s*1\.1875rem/
)
assert.doesNotMatch(
  css,
  /\.showroom-contacts--contacts \.showroom-contacts-title\s*\{[^}]*font-size:\s*1\.5rem/
)
assert.match(
  css,
  /\.contacts-nav-dropdown-menu a\.contact-action\.contact-action--density-dropdown,\s*\.contacts-nav-dropdown-menu button\.contact-action\.contact-action--density-dropdown\s*\{[^}]*min-height:\s*3\.375rem/
)
assert.match(
  css,
  /\.contacts-nav-dropdown-menu a\.contact-action\.contact-action--density-dropdown\.contact-dropdown-channel-link[\s\S]*?\{[^}]*min-height:\s*2\.75rem[^}]*height:\s*2\.75rem/
)

// /contacts page: shared H2 → first-content spacing (single source, not H2 shrink)
const stageBlock = css.match(/\.contacts-page-stage\s*\{[^}]*\}/)
assert.ok(stageBlock, "contacts-page-stage rule required")
assert.match(
  stageBlock[0],
  /--contacts-heading-to-content-gap:\s*1\.5rem/
) // 24px desktop
assert.match(
  stageBlock[0],
  /--contacts-stage-row-gap:\s*var\(\s*--contacts-heading-to-content-gap\s*\)/
)
assert.match(stageBlock[0], /row-gap:\s*var\(\s*--contacts-stage-row-gap\s*\)/)
assert.match(
  css,
  /@supports\s*\(\s*grid-template-rows:\s*subgrid\s*\)\s*\{[\s\S]*?\.contacts-page-col\s*\{[^}]*row-gap:\s*var\(\s*--contacts-stage-row-gap\s*\)/
)
const phonesPrimary = css.match(/\.contacts-page-row--primary-phones\s*\{[^}]*\}/)
assert.ok(phonesPrimary, "primary-phones row rule required")
assert.match(phonesPrimary[0], /align-items:\s*center/)
assert.match(phonesPrimary[0], /align-self:\s*stretch/)
assert.doesNotMatch(phonesPrimary[0], /align-items:\s*start/)
// Competing spacing on header/primary transition must be zeroed
assert.match(
  css,
  /\.contacts-page-row--header\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/
)
assert.match(
  css,
  /\.contacts-page-row--primary,\s*\.contacts-page-row--secondary\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/
)
const colTitle = css.match(/\.contacts-page-col-title\s*\{[^}]*\}/)
assert.ok(colTitle, "contacts-page-col-title rule required")
assert.match(colTitle[0], /font-size:\s*1\.625rem/)
assert.match(colTitle[0], /line-height:\s*1\.25/)
assert.match(colTitle[0], /margin:\s*0/)
const eyebrow = css.match(/\.contacts-page-eyebrow\s*\{[^}]*\}/)
assert.ok(eyebrow, "contacts-page-eyebrow rule required")
assert.match(eyebrow[0], /margin:\s*0\s+0\s+0\.5625rem/)
assert.match(
  css,
  /@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{[\s\S]*?\.contacts-page-col\s*\{[^}]*--contacts-heading-to-content-gap:\s*1\.25rem/
) // 20px mobile
assert.match(
  css,
  /@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{[\s\S]*?\.contacts-page-col\s*\{[^}]*gap:\s*var\(\s*--contacts-heading-to-content-gap\s*\)/
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
