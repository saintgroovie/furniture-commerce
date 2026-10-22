/** Closed D02/D17 map. Unknown keys never use the historical unapproved V2 map. */
export const PREPARED_REDIRECTS: Record<string, { survivorHandle: string; variantId: string }> = {
  "prod_01kntbxadecy5wknet16f2et5w": {
    "survivorHandle": "ol-08-1",
    "variantId": "variant_01KNTBXBMAY8AB48VM5QEEKK2R"
  },
  "ol-08-2": {
    "survivorHandle": "ol-08-1",
    "variantId": "variant_01KNTBXBMAY8AB48VM5QEEKK2R"
  },
  "prod_01km1qhnhzxxsrpfekazrsfpde": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ65TXYKJN8PQJ5KM5JP"
  },
  "greenwich-gr-09-1-bed-90": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ65TXYKJN8PQJ5KM5JP"
  },
  "prod_01km1qhnj0f34r2a8fq1cn4v1y": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ6791A8ZTF6SA4W47C6"
  },
  "greenwich-gr-14-1": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ6791A8ZTF6SA4W47C6"
  },
  "prod_01km1qhnj1e92bmjq8ce2rx7tk": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ67950W0Q81TF7F51EM"
  },
  "greenwich-gr-16-1": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ67950W0Q81TF7F51EM"
  },
  "prod_01km1qhnj1yte9ew5njz8yrf62": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ68EX7W37GWB0RQPQF9"
  },
  "greenwich-gr-18-1": {
    "survivorHandle": "greenwich-gr-12-1",
    "variantId": "variant_01KM1QHQ68EX7W37GWB0RQPQF9"
  }
}

export function retiredProductRedirect(key: string): { survivorHandle: string; variantId: string } | null {
  const normalized = key.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(PREPARED_REDIRECTS, normalized)
    ? PREPARED_REDIRECTS[normalized]! : null
}
export function retiredRedirectTarget(key: string, productIsPublic: boolean) {
  return productIsPublic ? null : retiredProductRedirect(key)
}
