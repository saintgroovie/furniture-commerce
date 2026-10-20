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

export const RETIRED_PRODUCT_IDS: Record<string, { survivorHandle: string; variantId: string }> = {
  "prod_01km1qhnhx9fdmx9rhbzab7k1k": { survivorHandle: "greenwich-gr-08-1", variantId: "variant_01KM1QHQ5YNMC8J2Y5KPD3JBBJ" },
  "prod_01km1qhnhz1a4j48k4cv10f4fm": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ6698TKR9XYZX09SFH6" },
  "prod_01km1qhnhzqsqm54a74vqjnh75": { survivorHandle: "greenwich-gr-02-1", variantId: "variant_01KM1QHQ65S146K0PMDM98AEMZ" },
  "prod_01km1qhnj0f34r2a8fq1cn4v1y": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ6791A8ZTF6SA4W47C6" },
  "prod_01km1qhnj1e92bmjq8ce2rx7tk": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ67950W0Q81TF7F51EM" },
  "prod_01km1qhnj1yte9ew5njz8yrf62": { survivorHandle: "greenwich-gr-09-1-bed-90", variantId: "variant_01KM1QHQ68EX7W37GWB0RQPQF9" },
  "prod_01kntbxadamwn4pd2kmwp2e4mh": { survivorHandle: "co-14-2", variantId: "variant_01KNTBXBM3B5WB3BH9311NTWPT" },
  "prod_01kntbxadb2m4e381qsz5x850s": { survivorHandle: "co-62-1", variantId: "variant_01KNTBXBM42648EXN9WWH69PPH" },
  "prod_01kntbxadbcce0ghpb33pvqxs2": { survivorHandle: "co-65-1", variantId: "variant_01KNTBXBM5JT70C71EY83C5K95" },
  "prod_01kntbxadbfhz2c5mh2m4pvvt8": { survivorHandle: "co-62-1", variantId: "variant_01KNTBXBM43HK2RHHGFQG2FT2G" },
  "prod_01kntbxadcyjkgnape1wgqjbqz": { survivorHandle: "ol-02-1", variantId: "variant_01KNTBXBM8R2J15MN970KWM0F9" },
  "prod_01kntbxadd48jaca24pc4txvcc": { survivorHandle: "ol-05-1", variantId: "variant_01KNTBXBM8WFHR81Z0RAWQZ1T5" },
  "prod_01kntbxaddbv29tsgtafzn9w5j": { survivorHandle: "ol-05-3", variantId: "variant_01KNTBXBM916QBNKP1B60BWPHM" },
  "prod_01kntbxadecy5wknet16f2et5w": { survivorHandle: "ol-08-1", variantId: "variant_01KNTBXBMAY8AB48VM5QEEKK2R" },
  "prod_01kntbxadf36e724rqtw6z73b0": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMBX03GX9WTGQAA35HW" },
  "prod_01kntbxadfnyaqgpeqkcm4npze": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMBTGQAE0VQC94SFJY6" },
  "prod_01kntbxadg6tfw8wb9spq4jtgd": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMB81GA2HENQ4Q54NDZ" },
  "prod_01kntbxadgh3ek5bm3raz2z7kt": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCT620T47GNE8ZKGH8" },
  "prod_01kntbxadgphkzewkkt477wnr7": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCHRJHHCED77MVCF82" },
  "prod_01kntbxadh2j4j6tda5ahynvv7": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMD2EGBJM0R1221ZV3V" },
  "prod_01kntbxadhe1yfjs2vepcrjjbn": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMDNYZ72376HJJXGAQ6" },
  "prod_01kntbxadhwb8k6bn1zbm7wewg": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMCDTGJ1G7N27Z6SMWD" },
  "prod_01kntbxadhz2mg5cds4eavg1rj": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMDKGQBDKVPG0T71PS3" },
  "prod_01kntbxadj9a2n7gqfhz4jtgd8": { survivorHandle: "ol-14-1", variantId: "variant_01KNTBXBMD9G2WYEDTYHYHGMG5" },
  "prod_01kntbxadrdxmgb8jrmab1jhps": { survivorHandle: "ol-44-1", variantId: "variant_01KNTBXBMGZEWN4405RK9P7D7X" },
  "prod_01kntbxadsbjmrq63haenwj880": { survivorHandle: "ol-55-1", variantId: "variant_01KNTBXBMHY23KPCJ1K5QP88HN" },
  "prod_01kntbxadvkwh122fjrekpt5gd": { survivorHandle: "ol-57-1", variantId: "variant_01KNTBXBMJC0FFV0F9HYGKYW3T" },
  "prod_01kntbxadw4a481e827ase6fw3": { survivorHandle: "ol-68-1", variantId: "variant_01KNTBXBMNW495R07XEBEZSJ3T" },
  "prod_01kntbxadwsahm0djv0snh29ak": { survivorHandle: "ol-65-1", variantId: "variant_01KNTBXBMMCN2HMK6TBHHHJ86S" },
  "prod_01kntbxadx120d41j3exqasj8q": { survivorHandle: "ol-69-1", variantId: "variant_01KNTBXBMNTTFM5HMBYPNETM0Z" },
  "prod_01kntbxadx813wwjt86d6j2e9w": { survivorHandle: "ol-84-1", variantId: "variant_01KNTBXBMT206FEYP02V9TQAQT" },
  "prod_01kntbxadxd2x796j2tj8sag74": { survivorHandle: "ol-69-1", variantId: "variant_01KNTBXBMPJ1AKQNBQS1FNDTZ2" },
  "prod_01kntbxady5tfy8abddzn9fq0r": { survivorHandle: "pv-02-1", variantId: "variant_01KNTBXBMW2V1NK579RXPPHVTC" },
  "prod_01kntbxadyet7ac1kcg28ek9rq": { survivorHandle: "ol-95-1", variantId: "variant_01KNTBXBMWT7JHF336KKKNYG8C" },
  "prod_01kntbxadztnake49pym4n1c8w": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMYM0626YQFBN3P9PSD" },
  "prod_01kntbxadzv2x8rhe2jg709bte": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMZPCZSJ179AGEKAAB9" },
  "prod_01kntbxae02hb0sm89w0bm82a2": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBN03X7QZTXTKZ7TV9JP" },
  "prod_01kntbxae066fz9jprecq0gzmj": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBMZ0Q9GKHY6ME76Y63H" },
  "prod_01kntbxae0hevegefcztyrndg2": { survivorHandle: "pv-14-1", variantId: "variant_01KNTBXBN04TQYFZ43BRRG3AYE" },
  "prod_01kntbxae0whww3gw89k4v2m88": { survivorHandle: "pv-55-1", variantId: "variant_01KNTBXBN1XGHXRC7YDPXFKVTF" },
  "prod_01kntbxae15mwm65c2t93zsgcw": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN36TMKGCY0FAMXEXHE" },
  "prod_01kntbxae1esnnw5da36pees6r": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN3M85D776RF4F0HKR4" },
  "prod_01kntbxae1sf1w6mba9q9xsrxf": { survivorHandle: "pv-66-6", variantId: "variant_01KNTBXBN4ZYKDGVKZN39J1X9K" },
  "prod_01kntbxae1tdx5mn4pzh57hm6y": { survivorHandle: "pv-68-1", variantId: "variant_01KNTBXBN4383S02RTSAQQTC8Y" },
  "prod_01kntbxae1wdnjrew50kekxgg2": { survivorHandle: "pv-65-5", variantId: "variant_01KNTBXBN3QMHS0MQV3MGBKXMZ" },
  "prod_01kv69a7am3kd13z7grd68hja2": { survivorHandle: "pa-05-1", variantId: "variant_01KV69A7H7D6YMFGSRS2VR3PSF" },
  "prod_01kv69a7amkv353y5wh6vybabk": { survivorHandle: "fk-05-1", variantId: "variant_01KV69A7H6WXSE9B2XV075CRS6" },
  "prod_01kv69a7ana9q0rm9fgcpm9kmq": { survivorHandle: "te-05-1", variantId: "variant_01KV69A7HAR5G3HAQ2M1CYR2VM" },
  "prod_01kx1pja6r9qnp7aqbg4nhwned": { survivorHandle: "pv-14-1", variantId: "variant_01KX1PJADDV8ER718D3PZ3A0B4" },
}

export function retiredProductRedirect(
  handle: string
): { survivorHandle: string; variantId: string } | null {
  const key = handle.trim().toLowerCase()
  const own = Object.prototype.hasOwnProperty
  if (own.call(RETIRED_PRODUCT_HANDLES, key)) return RETIRED_PRODUCT_HANDLES[key]!
  if (own.call(RETIRED_PRODUCT_IDS, key)) return RETIRED_PRODUCT_IDS[key]!
  return null
}

/** A still-published product keeps its own URL. Redirect only after it is gone. */
export function retiredRedirectTarget(
  handle: string,
  productIsPublic: boolean
): { survivorHandle: string; variantId: string } | null {
  if (productIsPublic) return null
  return retiredProductRedirect(handle)
}
