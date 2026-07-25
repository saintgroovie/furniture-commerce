/**
 * Single source of truth for public Woodright showroom contacts.
 * Header dropdown, mobile nav, contacts page, and Organization JSON-LD
 * must read from here - do not duplicate phones/address in components.
 */

export type ShowroomMessengerLink = {
  id: "telegram" | "whatsapp" | "max"
  label: string
  /** Confirmed deep link only. `null` = show as available channel, not a URL. */
  href: string | null
}

export type ShowroomPhone = {
  label: string
  display: string
  /** E.164-style value for `tel:` (no spaces), e.g. `+78005551736`. */
  tel: string
}

const MESSENGER_E164_DIGITS = "79672587144"

export const showroomContacts = {
  title: "Шоурум Woodright",
  addressLines: [
    "Московская область, г. Химки",
    "ул. Бутаково, д. 4",
    "МТК «Гранд-2», вход 3",
    "4 этаж, подиум Woodright",
  ] as const,
  /**
   * Compact address for dropdown / mobile chrome only.
   * Same facts as `addressLines` - presentation fold, not a second SoT.
   */
  addressLinesCompact: [
    "Московская область, г. Химки",
    "ул. Бутаково, д. 4",
    "МТК «Гранд-2» · вход 3 · 4 этаж",
    "подиум Woodright",
  ] as const,
  /** Schema.org PostalAddress fields derived from addressLines (no invented geo). */
  postalAddress: {
    addressCountry: "RU",
    addressRegion: "Московская область",
    addressLocality: "Химки",
    streetAddress: "ул. Бутаково, д. 4, МТК «Гранд-2», вход 3, 4 этаж, подиум Woodright",
  },
  freeCall: {
    label: "Бесплатный звонок",
    display: "+7 (800) 555-17-36",
    tel: "+78005551736",
  } satisfies ShowroomPhone,
  writeOrCall: {
    label: "Написать или позвонить",
    display: "+7 967 258-71-44",
    tel: "+79672587144",
  } satisfies ShowroomPhone,
  messengers: [
    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/+${MESSENGER_E164_DIGITS}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/${MESSENGER_E164_DIGITS}`,
    },
    {
      id: "max",
      label: "MAX",
      // Official MAX deeplinks target bots (`max.ru/<bot>`), not phone chats.
      // No confirmed phone deeplink in project or public docs - do not invent.
      href: null,
    },
  ] satisfies ReadonlyArray<ShowroomMessengerLink>,
} as const

export type ShowroomContacts = typeof showroomContacts

/** Organization JSON-LD fragment synced with showroomContacts (no duplicate blocks). */
export function getShowroomOrganizationContactLd() {
  return {
    telephone: [showroomContacts.freeCall.tel, showroomContacts.writeOrCall.tel],
    address: {
      "@type": "PostalAddress" as const,
      addressCountry: showroomContacts.postalAddress.addressCountry,
      addressRegion: showroomContacts.postalAddress.addressRegion,
      addressLocality: showroomContacts.postalAddress.addressLocality,
      streetAddress: showroomContacts.postalAddress.streetAddress,
    },
  }
}
