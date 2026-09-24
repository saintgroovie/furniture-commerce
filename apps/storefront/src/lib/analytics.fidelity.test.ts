/**
 * Guard: analytics env parsing, CSP extras, legal copy both modes.
 *
 *   yarn dlx tsx src/lib/analytics.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  analyticsCspConnectExtras,
  buildImgSrcDirective,
  loadAnalyticsPublicConfig,
  parseYmConsent,
  webmasterVerificationMetadata,
  YM_CONSENT_COOKIE,
} from "./analytics-config"
import { teardownYandexMetrika, YM_TAG_SRC } from "./analytics-metrika"
import { buildLegalPage } from "./legal/legal-content"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8")
const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8")
const analyticsUi = readFileSync(
  join(root, "src/components/storefront-analytics.tsx"),
  "utf8"
)

assert.equal(YM_CONSENT_COOKIE, "wr_ym_consent")
assert.equal(parseYmConsent("1"), "1")
assert.equal(parseYmConsent("0"), "0")
assert.equal(parseYmConsent("yes"), null)

const off = loadAnalyticsPublicConfig({})
assert.equal(off.yandexMetrikaId, null)
assert.equal(off.googleSiteVerification, null)
assert.equal(off.yandexWebmasterVerification, null)
assert.deepEqual(analyticsCspConnectExtras({}), [])
assert.equal(buildImgSrcDirective({}), "img-src 'self' data: blob:")
assert.equal(webmasterVerificationMetadata(off), undefined)

const on = loadAnalyticsPublicConfig({
  YANDEX_METRIKA_ID: "12345678",
  GOOGLE_SITE_VERIFICATION: "abcDEF123_-",
  YANDEX_WEBMASTER_VERIFICATION: "abcdef1234567890",
})
assert.equal(on.yandexMetrikaId, "12345678")
assert.equal(on.googleSiteVerification, "abcDEF123_-")
assert.equal(on.yandexWebmasterVerification, "abcdef1234567890")
assert.deepEqual(analyticsCspConnectExtras({ YANDEX_METRIKA_ID: "12345678" }), [
  "https://mc.yandex.ru",
  "https://mc.yandex.com",
])
assert.match(
  buildImgSrcDirective({ YANDEX_METRIKA_ID: "12345678" }),
  /img-src 'self' data: blob: https:\/\/mc\.yandex\.ru https:\/\/mc\.yandex\.com$/
)

assert.equal(
  loadAnalyticsPublicConfig({ YANDEX_METRIKA_ID: "not-a-id" }).yandexMetrikaId,
  null
)
assert.equal(
  loadAnalyticsPublicConfig({
    NEXT_PUBLIC_YANDEX_METRIKA_ID: "12345678",
  }).yandexMetrikaId,
  null
)
assert.deepEqual(
  analyticsCspConnectExtras({ NEXT_PUBLIC_YANDEX_METRIKA_ID: "12345678" }),
  []
)
assert.equal(
  loadAnalyticsPublicConfig({ GOOGLE_SITE_VERIFICATION: "<script>" })
    .googleSiteVerification,
  null
)

const cookiesOff = buildLegalPage("cookies", {}, off)
const cookiesOffText = [
  cookiesOff.title,
  ...cookiesOff.lead,
  ...cookiesOff.sections.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
  ]),
].join("\n")
assert.match(cookiesOffText, /Яндекс Метрики нет/)
assert.doesNotMatch(cookiesOffText, /wr_ym_consent/)

const cookiesOn = buildLegalPage("cookies", {}, on)
const cookiesOnText = [
  cookiesOn.title,
  ...cookiesOn.lead,
  ...cookiesOn.sections.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
  ]),
].join("\n")
assert.match(cookiesOnText, /wr_ym_consent/)
assert.match(cookiesOnText, /Яндекс Метрика/)
assert.doesNotMatch(cookiesOnText, /Яндекс Метрики нет/)
assert.match(cookiesOnText, /Вебвизор и карта кликов выключены/)

const privacyOn = buildLegalPage("privacy", {}, on)
assert.match(
  privacyOn.sections.flatMap((section) => section.paragraphs).join("\n"),
  /Яндекс Метрика получит технические данные визита/
)

assert.match(layout, /loadAnalyticsPublicConfig/)
assert.match(layout, /StorefrontAnalytics/)
assert.match(proxy, /buildImgSrcDirective/)
assert.match(cookiesOnText, /Выключить статистику/)
assert.match(cookiesOnText, /wr_ym_consent/)
assert.match(analyticsUi, /mc\.yandex\.ru\/metrika\/tag\.js/)
assert.match(analyticsUi, /webvisor: false/)
assert.match(analyticsUi, /clickmap: false/)
assert.doesNotMatch(analyticsUi, /defer:\s*true/)
assert.match(analyticsUi, /teardownYandexMetrika/)
assert.doesNotMatch(analyticsUi, /gtag\(|googletagmanager|facebook\.net/)

{
  const destructed: string[] = []
  const removed: string[] = []
  const win: {
    ym?: (...args: unknown[]) => void
    yaCounter12345678?: { destruct: () => void }
  } = {
    ym: () => {
      throw new Error("live ym must not run after teardown")
    },
    yaCounter12345678: {
      destruct: () => {
        destructed.push("counter")
      },
    },
  }
  teardownYandexMetrika("12345678", win, {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, `script[src="${YM_TAG_SRC}"]`)
      return [
        {
          remove: () => {
            removed.push("script")
          },
        },
      ]
    },
  })
  assert.deepEqual(destructed, ["counter"])
  assert.deepEqual(removed, ["script"])
  assert.equal(win.yaCounter12345678, undefined)
  win.ym?.(1, "hit")
}

{
  const win: { ym?: (...args: unknown[]) => void } = {
    ym: (...args: unknown[]) => {
      throw new Error(`in-flight ym must not run: ${args.join(",")}`)
    },
  }
  teardownYandexMetrika("12345678", win)
  win.ym?.(12345678, "init", { trackLinks: true })
}

console.log("analytics.fidelity: ok")
