/**
 * Retired catalog handles after sparse merge. The draft shell stays unpublished.
 * Opening the old URL selects that SKU on the surviving product.
 */
export const RETIRED_PRODUCT_HANDLES: Record<
  string,
  { survivorHandle: string; variantId: string }
> = {
  "co-15-2": { survivorHandle: "co-14-2", variantId: "variant_01KNTBXBM3B5WB3BH9311NTWPT" },
  "co-62-2": { survivorHandle: "co-62-1", variantId: "variant_01KNTBXBM42648EXN9WWH69PPH" },
  "co-62-3": { survivorHandle: "co-62-1", variantId: "variant_01KNTBXBM43HK2RHHGFQG2FT2G" },
  "co-65-2": { survivorHandle: "co-65-1", variantId: "variant_01KNTBXBM5JT70C71EY83C5K95" },
  "fk-05-3": { survivorHandle: "fk-05-1", variantId: "variant_01KV69A7H6WXSE9B2XV075CRS6" },
  "greenwich-gr-02-2": { survivorHandle: "greenwich-gr-02-1", variantId: "variant_01KM1QHQ65S146K0PMDM98AEMZ" },
  "greenwich-gr-08-2": { survivorHandle: "greenwich-gr-08-1", variantId: "variant_01KM1QHQ5YNMC8J2Y5KPD3JBBJ" },
  "greenwich-gr-12-1": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ6698TKR9XYZX09SFH6" },
  "greenwich-gr-14-1": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ6791A8ZTF6SA4W47C6" },
  "greenwich-gr-16-1": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ67950W0Q81TF7F51EM" },
  "greenwich-gr-18-1": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ68EX7W37GWB0RQPQF9" },
  "ol-03-1": { survivorHandle: "ol-02-1", variantId: "variant_01KNTBXBM8R2J15MN970KWM0F9" },
  "ol-05-2": { survivorHandle: "ol-05-1", variantId: "variant_01KNTBXBM8WFHR81Z0RAWQZ1T5" },
  "ol-05-n": { survivorHandle: "ol-05-3", variantId: "variant_01KNTBXBM916QBNKP1B60BWPHM" },
  "ol-08-2": { survivorHandle: "ol-08-1", variantId: "variant_01KNTBXBMAY8AB48VM5QEEKK2R" },
  "ol-14-2": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMBTGQAE0VQC94SFJY6" },
  "ol-15-1": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMBX03GX9WTGQAA35HW" },
  "ol-15-2": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMB81GA2HENQ4Q54NDZ" },
  "ol-16-1": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCHRJHHCED77MVCF82" },
  "ol-16-2": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCT620T47GNE8ZKGH8" },
  "ol-17-1": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCDTGJ1G7N27Z6SMWD" },
  "ol-17-2": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMDKGQBDKVPG0T71PS3" },
  "ol-17-3": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMD2EGBJM0R1221ZV3V" },
  "ol-18-1": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMDNYZ72376HJJXGAQ6" },
  "ol-18-2": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMD9G2WYEDTYHYHGMG5" },
  "ol-44-2": { survivorHandle: "ol-44-1", variantId: "variant_01KNTBXBMGZEWN4405RK9P7D7X" },
  "ol-55-2": { survivorHandle: "ol-55-1", variantId: "variant_01KNTBXBMHY23KPCJ1K5QP88HN" },
  "ol-57-2": { survivorHandle: "ol-57-1", variantId: "variant_01KNTBXBMJC0FFV0F9HYGKYW3T" },
  "ol-65-2": { survivorHandle: "ol-65-1", variantId: "variant_01KNTBXBMMCN2HMK6TBHHHJ86S" },
  "ol-68-2": { survivorHandle: "ol-68-1", variantId: "variant_01KNTBXBMNW495R07XEBEZSJ3T" },
  "ol-69-2": { survivorHandle: "ol-69-1", variantId: "variant_01KNTBXBMNTTFM5HMBYPNETM0Z" },
  "ol-69-3": { survivorHandle: "ol-69-1", variantId: "variant_01KNTBXBMPJ1AKQNBQS1FNDTZ2" },
  "ol-84-2": { survivorHandle: "ol-84-1", variantId: "variant_01KNTBXBMT206FEYP02V9TQAQT" },
  "ol-95-3": { survivorHandle: "ol-95-1", variantId: "variant_01KNTBXBMWT7JHF336KKKNYG8C" },
  "pa-05-3": { survivorHandle: "pa-05-1", variantId: "variant_01KV69A7H7D6YMFGSRS2VR3PSF" },
  "pv-03-1": { survivorHandle: "pv-02-1", variantId: "variant_01KNTBXBMW2V1NK579RXPPHVTC" },
  "pv-15-1": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMYM0626YQFBN3P9PSD" },
  "pv-15-2": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMZPCZSJ179AGEKAAB9" },
  "pv-16-1": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMZ0Q9GKHY6ME76Y63H" },
  "pv-16-2": { survivorHandle: "pv-14-1", variantId: "variant_01KX1PJADDV8ER718D3PZ3A0B4" },
  "pv-17-1": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBN03X7QZTXTKZ7TV9JP" },
  "pv-18-1": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBN04TQYFZ43BRRG3AYE" },
  "pv-55-2": { survivorHandle: "pv-55-1", variantId: "variant_01KNTBXBN1XGHXRC7YDPXFKVTF" },
  "pv-65-6": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN3M85D776RF4F0HKR4" },
  "pv-65-7": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN3QMHS0MQV3MGBKXMZ" },
  "pv-65-8": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN36TMKGCY0FAMXEXHE" },
  "pv-66-7": { survivorHandle: "pv-66-6", variantId: "variant_01KNTBXBN4ZYKDGVKZN39J1X9K" },
  "pv-68-2": { survivorHandle: "pv-68-1", variantId: "variant_01KNTBXBN4383S02RTSAQQTC8Y" },
  "te-05-3": { survivorHandle: "te-05-1", variantId: "variant_01KV69A7HAR5G3HAQ2M1CYR2VM" },
}

export function retiredProductRedirect(
  handle: string
): { survivorHandle: string; variantId: string } | null {
  return RETIRED_PRODUCT_HANDLES[handle.trim().toLowerCase()] ?? null
}
