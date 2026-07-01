import {
  isMedusaCanonicalSeedDemoProduct,
  isOliverKidsCollectionProduct,
  isProductInActiveCatalogScope,
  isProductInMainCatalogScope,
} from "./catalog-scope"
import { isKidsMetadataStorefrontProduct } from "./kids-metadata"
import {
  checkStaticMediaPaths,
  collectProductImageUrls,
  parseExecutionVariants,
  type ExecutionVariantSummary,
} from "./media-health"
import {
  analyzeProductThumbnailHealth,
  type ProductThumbnailIssue,
  resolveAdminListThumbnailSrc,
  resolveEffectiveThumbnail,
} from "./product-thumbnail"

export type ProductType = "STANDARD" | "CONFIGURABLE" | "BESPOKE" | "UNKNOWN"
export type ExpectedCta = "add_to_cart" | "request_quote" | "project_request" | "unknown"

export type SiteReadinessWarning = {
  severity: "info" | "warning" | "error"
  code: string
  message: string
}

export type PlacementReason = {
  surface: string
  visible: boolean
  because: string
}

export type SiteReadinessResponse = {
  product: {
    id: string
    handle: string
    title: string
    status: string
    collection?: string
  }
  storefront: {
    product_type: ProductType
    launch_mode?: string
    price_display_policy?: string
    visible_in_catalog: boolean
    visible_in_kids: boolean
    visible_in_project: boolean
    cart_allowed: boolean
    expected_cta: ExpectedCta
    buyer_facing_section?: string
  }
  placement: PlacementReason[]
  media: {
    thumbnail?: string
    effective_thumbnail?: string
    admin_list_thumbnail?: string
    thumbnail_health: {
      issues: ProductThumbnailIssue[]
      variants_missing_thumbnail: number
    }
    images: string[]
    gallery_count: number
    has_main: boolean
    execution_variant_count: number
    execution_variants: ExecutionVariantSummary[]
    missing: string[]
    broken: string[]
    media_health: {
      checked: boolean
      missing: string[]
      broken: string[]
    }
  }
  warnings: SiteReadinessWarning[]
}

export type RoomSetContext = {
  inKidsRoomSet: boolean
  inNonKidsRoomSet: boolean
  roomSetSlugs: string[]
}

const REQUEST_QUOTE_LAUNCH_MODE = "request_quote"
const BESPOKE_TYPE = "BESPOKE"

function metaStr(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key]
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function resolveProductType(product: Record<string, unknown>): ProductType {
  const cls = product.product_classification as { product_type?: string } | undefined
  const t = cls?.product_type
  if (t === "STANDARD" || t === "CONFIGURABLE" || t === "BESPOKE") return t
  const legacy = (product.custom_product_type as { product_type?: string } | undefined)?.product_type
  if (legacy === "STANDARD" || legacy === "CONFIGURABLE" || legacy === "BESPOKE") return legacy
  return "UNKNOWN"
}

function resolveExpectedCta(
  productType: ProductType,
  launchMode?: string
): ExpectedCta {
  if (productType === "BESPOKE") return "project_request"
  if (launchMode === REQUEST_QUOTE_LAUNCH_MODE) return "request_quote"
  if (productType === "STANDARD" || productType === "CONFIGURABLE") return "add_to_cart"
  return "unknown"
}

function resolveBuyerFacingSection(productType: ProductType): string | undefined {
  switch (productType) {
    case "STANDARD":
      return "Готовые"
    case "CONFIGURABLE":
      return "С выбором исполнения"
    case "BESPOKE":
      return "По проекту"
    default:
      return undefined
  }
}

function computeKidsVisible(
  product: Record<string, unknown>,
  productType: ProductType,
  published: boolean,
  roomContext?: RoomSetContext
): boolean {
  if (!published) return false
  if (productType === BESPOKE_TYPE) return false
  if (isMedusaCanonicalSeedDemoProduct(product)) return false
  if (!isProductInActiveCatalogScope(product)) return false

  const metadataKids =
    isOliverKidsCollectionProduct(product) || isKidsMetadataStorefrontProduct(product)

  if (roomContext?.inNonKidsRoomSet) return false

  if (roomContext?.inKidsRoomSet && !roomContext.inNonKidsRoomSet) return true
  if (metadataKids && !roomContext?.inNonKidsRoomSet) return true
  return false
}

function computeCatalogVisible(
  product: Record<string, unknown>,
  productType: ProductType,
  published: boolean,
  kidsVisible: boolean
): boolean {
  if (!published) return false
  if (productType === BESPOKE_TYPE) return false
  if (kidsVisible) return false
  if (isMedusaCanonicalSeedDemoProduct(product)) return false
  return isProductInMainCatalogScope(product)
}

function computeProjectVisible(
  product: Record<string, unknown>,
  productType: ProductType,
  published: boolean
): boolean {
  if (!published) return false
  if (productType !== BESPOKE_TYPE) return false
  if (isMedusaCanonicalSeedDemoProduct(product)) return false
  return isProductInActiveCatalogScope(product)
}

function buildPlacement(
  product: Record<string, unknown>,
  productType: ProductType,
  published: boolean,
  catalogVisible: boolean,
  kidsVisible: boolean,
  projectVisible: boolean,
  roomContext?: RoomSetContext
): PlacementReason[] {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const collection = metaStr(meta, "collection")
  const status = String(product.status ?? "unknown")

  const placements: PlacementReason[] = [
    {
      surface: "/catalog",
      visible: catalogVisible,
      because: catalogVisible
        ? `status=${status}, product_type=${productType}, active collection scope`
        : !published
          ? `status=${status} (not published)`
          : productType === BESPOKE_TYPE
            ? "product_type=BESPOKE excluded from main catalog"
            : kidsVisible
              ? "kids assortment — shown in /kids/catalog instead"
              : isMedusaCanonicalSeedDemoProduct(product)
                ? "canonical seed demo handle hidden on storefront"
                : !isProductInMainCatalogScope(product)
                  ? `collection=${collection ?? "(none)"} not in active main catalog scope`
                  : "not eligible for main catalog",
    },
    {
      surface: "/kids/catalog",
      visible: kidsVisible,
      because: kidsVisible
        ? [
            collection ? `collection=${collection}` : null,
            meta.storefront_section === "kids" ? "metadata.storefront_section=kids" : null,
            roomContext?.inKidsRoomSet ? `room_set=${roomContext.roomSetSlugs.join(",")}` : null,
          ]
            .filter(Boolean)
            .join("; ") || "kids metadata or room set"
        : !published
          ? `status=${status}`
          : productType === BESPOKE_TYPE
            ? "BESPOKE excluded from kids catalog"
            : roomContext?.inNonKidsRoomSet
              ? "also in non-kids room set"
              : "no kids metadata / room set membership",
    },
    {
      surface: "/bespoke/catalog (По проекту)",
      visible: projectVisible,
      because: projectVisible
        ? "product_type=BESPOKE, published, active scope"
        : productType !== BESPOKE_TYPE
          ? `product_type=${productType}`
          : !published
            ? `status=${status}`
            : "inactive collection or seed demo",
    },
    {
      surface: "PDP /product/:id",
      visible: published,
      because: published ? `status=${status}` : `status=${status} — draft not on storefront lists`,
    },
    {
      surface: "rooms",
      visible: Boolean(roomContext?.roomSetSlugs.length),
      because: roomContext?.roomSetSlugs.length
        ? `room_set slug(s): ${roomContext.roomSetSlugs.join(", ")}`
        : "not linked to active room sets",
    },
  ]

  if (collection) {
    placements.push({
      surface: `collection:${collection}`,
      visible: isProductInActiveCatalogScope(product) && published,
      because: `metadata.collection=${collection}`,
    })
  }

  return placements
}

function buildWarnings(input: {
  productType: ProductType
  launchMode?: string
  published: boolean
  catalogVisible: boolean
  kidsVisible: boolean
  cartAllowed: boolean
  expectedCta: ExpectedCta
  thumbnail?: string
  effectiveThumbnail?: string
  thumbnailIssues: ProductThumbnailIssue[]
  galleryCount: number
  executionCount: number
  meta: Record<string, unknown>
  missing: string[]
}): SiteReadinessWarning[] {
  const warnings: SiteReadinessWarning[] = []

  if (input.productType === BESPOKE_TYPE && input.cartAllowed) {
    warnings.push({
      severity: "error",
      code: "bespoke_cart_allowed",
      message: "BESPOKE product should not be cartable",
    })
  }

  if (input.productType === "CONFIGURABLE" && input.executionCount < 2) {
    warnings.push({
      severity: "warning",
      code: "configurable_no_execution_media",
      message: "CONFIGURABLE product has no execution media (finish_color_executions)",
    })
  }

  if (input.published && !input.thumbnail) {
    warnings.push({
      severity: "warning",
      code: "published_no_thumbnail",
      message: "Published product has no thumbnail",
    })
  }

  for (const issue of input.thumbnailIssues) {
    warnings.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })
  }

  if (
    input.published &&
    input.thumbnail &&
    input.effectiveThumbnail &&
    input.thumbnail !== input.effectiveThumbnail &&
    input.thumbnailIssues.some((i) => i.code === "thumbnail_localhost_absolute")
  ) {
    warnings.push({
      severity: "info",
      code: "admin_thumbnail_format_mismatch",
      message:
        "Список админки использует thumbnail в другом формате URL, чем галерея — нормализуйте через sync-product-thumbnails",
    })
  }

  if (input.published && input.galleryCount === 0 && !input.thumbnail) {
    warnings.push({
      severity: "warning",
      code: "published_no_gallery",
      message: "Published product has no gallery images",
    })
  }

  if (
    input.published &&
    !input.catalogVisible &&
    !input.kidsVisible &&
    input.productType !== BESPOKE_TYPE
  ) {
    warnings.push({
      severity: "warning",
      code: "published_invisible",
      message: "Product is published but not visible in any storefront catalog section",
    })
  }

  if (input.launchMode === REQUEST_QUOTE_LAUNCH_MODE && input.productType === "STANDARD") {
    warnings.push({
      severity: "info",
      code: "standard_request_quote",
      message: "STANDARD product with request_quote launch_mode — CTA is request, not direct cart",
    })
  }

  if (input.productType === "STANDARD" && input.launchMode === REQUEST_QUOTE_LAUNCH_MODE) {
    warnings.push({
      severity: "warning",
      code: "request_quote_cart_risk",
      message: "Request quote product — verify CTA is not normal add-to-cart on storefront",
    })
  }

  const kidsMeta = isKidsMetadataStorefrontProduct({ metadata: input.meta })
  if (kidsMeta && input.published && !input.kidsVisible) {
    warnings.push({
      severity: "warning",
      code: "kids_not_visible",
      message: "Kids product metadata present but product not visible in Kids catalog",
    })
  }

  if (input.meta.country_assignment_v2_applied_at && input.missing.length > 0) {
    warnings.push({
      severity: "warning",
      code: "country_assignment_media_missing",
      message: "Country assignment marker exists but required static media is missing on disk",
    })
  }

  if (input.missing.length > 0) {
    warnings.push({
      severity: "warning",
      code: "missing_static_media",
      message: `${input.missing.length} static media file(s) missing on disk`,
    })
  }

  return warnings
}

export function computeSiteReadiness(
  product: Record<string, unknown>,
  options?: {
    roomContext?: RoomSetContext
    backendRoot?: string
    checkStaticFiles?: boolean
  }
): SiteReadinessResponse {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const productType = resolveProductType(product)
  const launchMode = metaStr(meta, "launch_mode")
  const priceDisplayPolicy = metaStr(meta, "price_display_policy")
  const published = product.status === "published"
  const collection = metaStr(meta, "collection")
  const cartAllowed = productType !== BESPOKE_TYPE
  const expectedCta = resolveExpectedCta(productType, launchMode)

  const kidsVisible = computeKidsVisible(product, productType, published, options?.roomContext)
  const catalogVisible = computeCatalogVisible(product, productType, published, kidsVisible)
  const projectVisible = computeProjectVisible(product, productType, published)

  const imageUrls = collectProductImageUrls(product)
  const executionVariants = parseExecutionVariants(product)
  const thumbnailHealth = analyzeProductThumbnailHealth(product, {
    backendRoot: options?.backendRoot,
  })
  const thumbnail = thumbnailHealth.stored_thumbnail
  const effectiveThumbnail = resolveEffectiveThumbnail(product)
  const adminListThumbnail = resolveAdminListThumbnailSrc(thumbnail ?? effectiveThumbnail)

  const staticCheck =
    options?.checkStaticFiles && options.backendRoot
      ? checkStaticMediaPaths(imageUrls, options.backendRoot)
      : { missing: [] as string[], broken: [] as string[] }

  const warnings = buildWarnings({
    productType,
    launchMode,
    published,
    catalogVisible,
    kidsVisible,
    cartAllowed,
    expectedCta,
    thumbnail,
    effectiveThumbnail,
    thumbnailIssues: thumbnailHealth.issues,
    galleryCount: imageUrls.length,
    executionCount: executionVariants.length,
    meta,
    missing: staticCheck.missing,
  })

  return {
    product: {
      id: String(product.id ?? ""),
      handle: String(product.handle ?? ""),
      title: String(product.title ?? ""),
      status: String(product.status ?? "unknown"),
      collection,
    },
    storefront: {
      product_type: productType,
      launch_mode: launchMode,
      price_display_policy: priceDisplayPolicy,
      visible_in_catalog: catalogVisible,
      visible_in_kids: kidsVisible,
      visible_in_project: projectVisible,
      cart_allowed: cartAllowed,
      expected_cta: expectedCta,
      buyer_facing_section: resolveBuyerFacingSection(productType),
    },
    placement: buildPlacement(
      product,
      productType,
      published,
      catalogVisible,
      kidsVisible,
      projectVisible,
      options?.roomContext
    ),
    media: {
      thumbnail,
      effective_thumbnail: effectiveThumbnail,
      admin_list_thumbnail: adminListThumbnail,
      thumbnail_health: {
        issues: thumbnailHealth.issues,
        variants_missing_thumbnail: thumbnailHealth.variants_missing_thumbnail.length,
      },
      images: imageUrls,
      gallery_count: imageUrls.length,
      has_main: Boolean(thumbnail || imageUrls[0]),
      execution_variant_count: executionVariants.length,
      execution_variants: executionVariants,
      missing: staticCheck.missing,
      broken: staticCheck.broken,
      media_health: {
        checked: Boolean(options?.checkStaticFiles),
        missing: staticCheck.missing,
        broken: staticCheck.broken,
      },
    },
    warnings,
  }
}
