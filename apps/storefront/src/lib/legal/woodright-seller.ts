/**
 * Owner-confirmed seller identity for the new Woodright site.
 * OD-01 = A · OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK
 *
 * Bank details are intentionally absent (OD-10 = B). Do not add account / BIK.
 */

export const sellerPostalAddress = {
  addressCountry: "RU",
  postalCode: "153025",
  addressLocality: "Иваново",
  streetAddress: "ул. Дзержинского, д. 39, оф. 514",
} as const

export const woodrightSeller = {
  token: "OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK",
  fullName: "Общество с ограниченной ответственностью «Роэл-Техник»",
  shortName: "ООО «Роэл-Техник»",
  ogrn: "1153702012848",
  inn: "3702111074",
  kpp: "370201001",
  legalAddress: `${sellerPostalAddress.postalCode}, г. ${sellerPostalAddress.addressLocality}, ${sellerPostalAddress.streetAddress}`,
} as const

export type WoodrightSeller = typeof woodrightSeller
