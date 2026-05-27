import { motifSourceLabel, titleSourceLabel } from "./approval-board-constants"
import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"
import { decorFromColorGuess, decorFromFilename } from "./approval-board-ww-decor-client"

type Props = {
  ctx: SkuPoolContext | undefined
  handle: string
  item?: ChecklistItem
  compact?: boolean
}

const WW_MOTIF_MISSING =
  "Роспись / мотив не определены — у Willie Winkie нельзя подтверждать только по форме (подколлекция росписи обязательна)."

function candidateMotifHint(item?: ChecklistItem): string | null {
  if (!item) return null
  return decorFromColorGuess(item.color_guess) || decorFromFilename(item.filename)
}

function WillieWinkieIdentity({ ctx, handle, item, compact }: Props) {
  const productType = ctx?.product_type_title || ctx?.product_title || "—"
  const motif = ctx?.motif_subcollection
  const motifExpected = ctx?.motif_subcollection_expected
  const motifObserved = ctx?.motif_subcollection_observed
  const catalog = ctx?.catalog_code_label
  const motifLow = ctx?.motif_confidence === "low"
  const motifUnknown = !motif || ctx?.motif_confidence === "unknown"
  const cardHint = candidateMotifHint(item)

  return (
    <div className={`ab-identity ab-identity-ww ${compact ? "ab-identity-compact" : ""}`}>
      <div className="ab-identity-line ab-identity-line-primary">
        <span className="ab-identity-handle">{handle}</span>
        <span className="ab-identity-sep">·</span>
        <span className="ab-identity-type">{productType}</span>
      </div>
      <div className="ab-identity-line ab-identity-line-collection">
        <span className="ab-identity-collection-main">Willie Winkie</span>
        {motif && !ctx?.motif_mismatch ? (
          <>
            <span className="ab-identity-sep">·</span>
            <span className="ab-identity-motif">
              роспись / мотив: <strong>{motif}</strong>
            </span>
          </>
        ) : null}
        {catalog ? (
          <>
            <span className="ab-identity-sep">·</span>
            <span className="ab-identity-catalog">{catalog}</span>
          </>
        ) : null}
      </div>

      {motifUnknown ? <div className="ab-identity-warn ab-ww-warn">{WW_MOTIF_MISSING}</div> : null}

      {ctx?.motif_mismatch ? (
        <div className="ab-identity-warn ab-ww-warn">
          ⚠ Подколлекция росписи: SKU ожидает <b>{motifExpected}</b>, legacy-страница — <b>{motifObserved}</b>.
          Одна форма, разная роспись — не approve только по силуэту; Needs review или Reject.
        </div>
      ) : null}

      {cardHint && motifLow ? (
        <div className="ab-identity-meta ab-source-low">файл/чеклист (низкая уверенность): {cardHint}</div>
      ) : null}

      <div className="ab-identity-meta ab-identity-sources">
        <span>тип товара: {titleSourceLabel(ctx?.product_identity_source || "unknown")}</span>
        <span> · мотив: {motifSourceLabel(ctx?.motif_source || "unknown")}</span>
        {motifLow ? <span className="ab-source-low"> · низкая уверенность мотива</span> : null}
      </div>
      {ctx?.product_title_raw && ctx.product_title_raw !== productType ? (
        <div className="ab-identity-raw" title="Полный legacy h1">
          legacy: {ctx.product_title_raw}
        </div>
      ) : null}
    </div>
  )
}

export function ProductIdentityBlock({ ctx, handle, item, compact }: Props) {
  const isWw = Boolean(ctx?.is_willie_winkie || item?.collection === "willie-winkie")

  if (isWw) {
    return <WillieWinkieIdentity ctx={ctx} handle={handle} item={item} compact={compact} />
  }

  const title = ctx?.product_type_title || ctx?.product_title
  const hasTitle = Boolean(title && title.trim())

  if (!hasTitle) {
    return (
      <div className={`ab-identity ab-identity-missing ${compact ? "ab-identity-compact" : ""}`}>
        <strong>{handle}</strong>
        <div className="ab-identity-warn">
          Название товара не найдено — подтверждать можно только по фото и SKU.
        </div>
        {ctx?.collection_label || ctx?.collection ? (
          <div className="ab-identity-meta">коллекция: {ctx.collection_label || ctx.collection}</div>
        ) : null}
        <div className="ab-identity-source">product identity source: unknown</div>
      </div>
    )
  }

  const sourceClass = ctx?.title_confidence === "low" ? "ab-source-low" : ""

  return (
    <div className={`ab-identity ${compact ? "ab-identity-compact" : ""}`}>
      <div className="ab-identity-line ab-identity-line-primary">
        <span className="ab-identity-handle">{handle}</span>
        <span className="ab-identity-sep">·</span>
        <span className="ab-identity-type">{title}</span>
        {ctx?.collection_label || ctx?.collection ? (
          <>
            <span className="ab-identity-sep">·</span>
            <span className="ab-identity-collection">{ctx.collection_label || ctx.collection}</span>
          </>
        ) : null}
      </div>
      <div className={`ab-identity-meta ${sourceClass}`}>
        {ctx?.category ? <span>тип: {ctx.category}</span> : null}
        {ctx?.dimensions_label ? <span> · размер: {ctx.dimensions_label}</span> : null}
      </div>
      <div className="ab-identity-source">
        product identity source: {titleSourceLabel(ctx?.product_identity_source || "unknown")}
      </div>
    </div>
  )
}
