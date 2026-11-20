/**
 * Single source of truth for public Woodright showroom contacts.
 * Header dropdown, mobile nav, contacts page, and Organization JSON-LD
 * must read from here - do not duplicate phones/address in components.
 */

export type ShowroomMessengerLink = {
  id: "telegram" | "whatsapp" | "max"
  label: string
  /** Confirmed external messenger URL (open in new tab). */
  href: string
}

/** Owner-provided public MAX profile URL - do not invent or transform. */
export const MAX_PUBLIC_PROFILE_URL =
  "https://max.ru/u/f9LHodD0cOJ5_V6hgbN0ynWCHmdN5hSOJw23-7TpHcNYdvB-CNqBlw4dsHI" as const

export type ShowroomPhone = {
  label: string
  display: string
  /** E.164-style value for `tel:` (no spaces), e.g. `+78005551736`. */
  tel: string
}

const MESSENGER_E164_DIGITS = "79672587144"

/**
 * Woodright organization card verified in Yandex Maps on 2026-10-31.
 * Address: ул. Бутаково, 4, Химки, подъезд 3. The card links to woodright.ru.
 * Keep the verified organization URL without invented coordinates.
 */
const YANDEX_MAPS_WOODRIGHT_URL =
  "https://yandex.com/maps/org/woodright/172762064090/" as const

export const showroomContacts = {
  title: "Шоурум Woodright",
  /** Contacts-oriented panel title (header contacts dropdown). */
  contactsTitle: "Контакты Woodright",
  /**
   * Compact chrome label for desktop/mobile top-bar showroom entry.
   * Not a second address SoT - presentation only; full address stays in address lines.
   */
  shortLabel: "Шоурум: «Гранд», Химки",
  /** Presentation label for the direct showroom phone in the showroom dropdown / page. */
  showroomCallLabel: "Телефон шоурума",
  /**
   * Full-page `/contacts` address order (visit-first).
   * Same facts as `addressLinesCompact` / `postalAddress` - presentation only.
   */
  addressLines: [
    "МТК «Гранд-2», вход 3, 4 этаж",
    "подиум Woodright",
    "Московская область, г. Химки",
    "ул. Бутаково, д. 4",
  ] as const,
  /**
   * Compact address for showroom dropdown chrome only.
   * Same facts as `addressLines` - presentation fold, not a second SoT.
   */
  addressLinesCompact: [
    "Московская область, г. Химки",
    "ул. Бутаково, д. 4",
    "МТК «Гранд-2» · вход 3 · 4 этаж",
    "подиум Woodright",
  ] as const,
  /** Schema.org PostalAddress fields (semantic; independent of page line order). */
  postalAddress: {
    addressCountry: "RU",
    addressRegion: "Московская область",
    addressLocality: "Химки",
    streetAddress: "ул. Бутаково, д. 4, МТК «Гранд-2», вход 3, 4 этаж, подиум Woodright",
  },
  /**
   * Verified Woodright organization card at the showroom address.
   * Card ownership and phone synchronization require separate account access.
   */
  yandexMapsUrl: YANDEX_MAPS_WOODRIGHT_URL,
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
      href: MAX_PUBLIC_PROFILE_URL,
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
