/**
 * SoT for the 5 Woodright legal/policy pages: privacy, terms, delivery,
 * payment, returns.
 *
 * Status is `draft` or `missing_owner_input` - never `approved` - until the
 * business owner supplies the real legal text (INN/OGRN, exact wording,
 * timelines, PSP-specific language). Do NOT invent legal facts here. Every
 * section is provenance-commented to one of the two confirmed sources in
 * this repo:
 *
 * - `@/lib/showroom-contacts` - public address / phones / messengers.
 * - `checkoutCopy` in `@/lib/woodright-copy` - confirmed checkout UX: no
 *   online card payment on-site, manager sends a payment link after order
 *   confirmation (`pp_system_default` is Medusa checkout plumbing, not a
 *   PSP - see `apps/storefront/src/lib/api/checkout.ts`).
 *
 * Anything not confirmed by one of those two sources stays a neutral
 * "уточняйте у менеджера" / "готовится" placeholder - never a specific
 * price, deadline, guarantee, or legal-entity detail.
 *
 * Owner questions needed to move any page to `approved` are tracked in
 * `docs/evidence/public-launch-20260730/owner-legal-decision-packet.md`.
 */
import { checkoutCopy } from "@/lib/woodright-copy"
import type { LegalContentStatus } from "@/lib/launch-contract"
import { showroomContacts } from "@/lib/showroom-contacts"

export type LegalPageSlug = "privacy" | "terms" | "delivery" | "payment" | "returns"

export type LegalPageSection = {
  title: string
  paragraphs: string[]
}

export type LegalPage = {
  slug: LegalPageSlug
  title: string
  h1: string
  description: string
  status: LegalContentStatus
  sections: LegalPageSection[]
}

const CLARIFY_WITH_MANAGER = "Актуальные условия уточняйте у менеджера при оформлении заказа"
const CONTENT_IN_PROGRESS = "Полный текст раздела готовится"

// Provenance: @/lib/showroom-contacts (single SoT for public contact channels).
const contactSection: LegalPageSection = {
  title: "Как с нами связаться",
  paragraphs: [
    showroomContacts.title,
    showroomContacts.addressLines.join(", "),
    `${showroomContacts.freeCall.label}: ${showroomContacts.freeCall.display}`,
    `${showroomContacts.writeOrCall.label}: ${showroomContacts.writeOrCall.display}`,
    CLARIFY_WITH_MANAGER,
  ],
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    slug: "privacy",
    title: "Политика конфиденциальности - Woodright",
    h1: "Политика конфиденциальности",
    description: "Как Woodright обрабатывает персональные данные покупателей",
    // No confirmed legal-entity / data-operator facts (INN, OGRN, DPO
    // contact) exist anywhere in this repo - owner input required before
    // this page can carry real policy text.
    status: "missing_owner_input",
    sections: [
      {
        title: "Раздел в разработке",
        paragraphs: [CONTENT_IN_PROGRESS, CLARIFY_WITH_MANAGER],
      },
      contactSection,
    ],
  },
  {
    slug: "terms",
    title: "Условия покупки - Woodright",
    h1: "Условия покупки",
    description: "Как оформляется заказ на мебель Woodright",
    // No confirmed legal-entity / contract text - only the checkout UX facts
    // below are confirmed, so this stays draft, not approved.
    status: "draft",
    sections: [
      {
        // Provenance: checkoutCopy.paymentClarity (@/lib/woodright-copy).
        title: "Как проходит оформление",
        paragraphs: [...checkoutCopy.paymentClarity],
      },
      {
        title: "Полные условия",
        paragraphs: [CONTENT_IN_PROGRESS, CLARIFY_WITH_MANAGER],
      },
      contactSection,
    ],
  },
  {
    slug: "delivery",
    title: "Доставка - Woodright",
    h1: "Доставка",
    description: "Условия доставки мебели Woodright",
    // Regions, cost, carrier and timelines are not confirmed anywhere in the
    // repo - owner input required before this page can name any of them.
    status: "missing_owner_input",
    sections: [
      {
        // Provenance: checkoutCopy.nextStepsBullets (@/lib/woodright-copy) -
        // confirms delivery/assembly details are agreed with the manager
        // after order confirmation, not on-site at checkout.
        title: "Как согласуется доставка",
        paragraphs: [checkoutCopy.nextStepsBullets[1]],
      },
      {
        title: "Регионы и сроки",
        paragraphs: [CONTENT_IN_PROGRESS, CLARIFY_WITH_MANAGER],
      },
      contactSection,
    ],
  },
  {
    slug: "payment",
    title: "Оплата - Woodright",
    h1: "Оплата",
    description: "Как оплачивается заказ на мебель Woodright",
    // Confirmed checkout UX facts exist (no online payment on-site, manager
    // sends a payment link) - but no PSP name, invoicing entity, or refund
    // mechanics are confirmed, so this stays draft, not approved.
    status: "draft",
    sections: [
      {
        // Provenance: checkoutCopy.paymentClarity (@/lib/woodright-copy).
        title: "Оплата заказа",
        paragraphs: [...checkoutCopy.paymentClarity],
      },
      {
        // Provenance: checkout.ts SYSTEM_PAYMENT_PROVIDER comment -
        // pp_system_default is checkout plumbing, not a payment provider.
        title: "Онлайн-оплата на сайте",
        paragraphs: ["Приём банковских карт на сайте сейчас не подключён", CLARIFY_WITH_MANAGER],
      },
      contactSection,
    ],
  },
  {
    slug: "returns",
    title: "Возврат - Woodright",
    h1: "Возврат",
    description: "Условия возврата мебели Woodright",
    // Return window, condition requirements, and refund timelines are not
    // confirmed anywhere in the repo - owner input required.
    status: "missing_owner_input",
    sections: [
      {
        title: "Раздел в разработке",
        paragraphs: [CONTENT_IN_PROGRESS, CLARIFY_WITH_MANAGER],
      },
      contactSection,
    ],
  },
] as const

export function getLegalPage(slug: LegalPageSlug): LegalPage {
  const page = LEGAL_PAGES.find((p) => p.slug === slug)
  if (!page) {
    throw new Error(`Unknown legal page slug: "${slug}"`)
  }
  return page
}

export function allLegalStatuses(): Record<LegalPageSlug, LegalContentStatus> {
  const out = {} as Record<LegalPageSlug, LegalContentStatus>
  for (const page of LEGAL_PAGES) {
    out[page.slug] = page.status
  }
  return out
}

/**
 * public_indexable readiness requires every legal page to be owner-approved.
 * No page is `approved` today - this always throws, which is the correct
 * fail-closed state until the owner supplies real legal text.
 */
export function assertLegalApprovedForPublicIndexable(): void {
  const notApproved = LEGAL_PAGES.filter((p) => p.status !== "approved")
  if (notApproved.length) {
    throw new Error(
      `Legal content not approved for public_indexable: ${notApproved
        .map((p) => `${p.slug}=${p.status}`)
        .join(", ")}`
    )
  }
}
