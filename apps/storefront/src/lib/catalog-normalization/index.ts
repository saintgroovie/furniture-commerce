/**
 * Storefront thin re-export of backend public-title contract.
 * Keep logic in backend lib — no second SoT.
 *
 * Path depth: this file lives in storefront/src/lib/catalog-normalization/
 * → apps/backend is four levels up.
 */
export {
  resolvePublicProductTitle,
  extractLatinModelName,
  titleAlreadyHasModelName,
  stripLegacyKidsCatalogTitleNoise,
  productHasHingeSideOption,
  stripHingeSideParenthetical,
  titleSignalsHingeSideOption,
  PUBLIC_TITLE_TRANSFORM_VERSION,
  type PublicTitleParts,
  type PublicTitleInput,
} from "../../../../backend/src/lib/catalog-normalization/public-title"

export {
  expandPedestalDeskCodeInTitle,
  extractPedestalDeskCode,
  PEDESTAL_DESK_CODE_MAP,
} from "../../../../backend/src/lib/catalog-normalization/pedestal-desk-codes"

export {
  phraseBuyerTitle,
  repairLegacyTitleNoise,
  resolveTitleCollectionSlug,
  collectionTitleName,
  titleNamesModel,
  COLLECTION_TITLE_NAME_RU,
  SINGLE_PEDESTAL_DESK_CODE_MAP,
} from "../../../../backend/src/lib/catalog-normalization/buyer-title-phrasing"

export {
  sanitizeBuyerDescription,
  SHARED_EXECUTION_NOTE,
  type BuyerDescriptionResult,
} from "../../../../backend/src/lib/catalog-normalization/buyer-description"

export {
  isMedusaStubOptionTitle,
  CANONICAL_OPTION_GROUP_LABELS,
  BUYER_OPTION_AXIS_ORDER,
} from "../../../../backend/src/lib/catalog-normalization/option-taxonomy"
