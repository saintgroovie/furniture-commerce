import { decorSourceLabel, titleSourceLabel } from "./approval-board-constants"
import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"
import { decorFromColorGuess, decorFromFilename } from "./approval-board-ww-decor-client"

type Props = {
  ctx: SkuPoolContext | undefined
  handle: string
  item?: ChecklistItem
  compact?: boolean
}

const WW_DECOR_MISSING =
  "Роспись/декор не определены — у Willie Winkie нельзя подтверждать только по форме."

function candidateDecorHint(item?: ChecklistItem): string | null {
  if (!item) return null
  return decorFromColorGuess(item.color_guess) || decorFromFilename(item.filename)
}

export function ProductIdentityBlock({ ctx, handle, item, compact }: Props) {
  const title = ctx?.product_title
  const hasTitle = Boolean(title && title.trim())
  const isWw = Boolean(ctx?.is_willie_winkie || item?.collection === "willie-winkie")
  const cardDecorHint = candidateDecorHint(item)
  const hasDecor = Boolean(ctx?.decor_motif && ctx.decor_motif.trim())
  const decorLow = ctx?.decor_confidence === "low"
  const decorUnknown = !hasDecor || ctx?.decor_confidence === "unknown"

  if (!hasTitle) {
    return (
      <div className={`ab-identity ab-identity-missing ${compact ? "ab-identity-compact" : ""}`}>
        <strong>{handle}</strong>
        <div className="ab-identity-warn">
          Название товара не найдено — подтверждать можно только по фото и SKU.
        </div>
        {isWw && decorUnknown ? <div className="ab-identity-warn ab-ww-warn">{WW_DECOR_MISSING}</div> : null}
        {ctx?.collection_label || ctx?.collection ? (
          <div className="ab-identity-meta">коллекция: {ctx.collection_label || ctx.collection}</div>
        ) : null}
        <div className="ab-identity-source">title source: unknown</div>
      </div>
    )
  }

  const sourceClass = ctx?.title_confidence === "low" ? "ab-source-low" : ""

  return (
    <div className={`ab-identity ${compact ? "ab-identity-compact" : ""}`} data-ww={isWw ? "1" : "0"}>
      <div className="ab-identity-headline">
        <span className="ab-identity-handle">{handle}</span>
        <span className="ab-identity-sep">·</span>
        <span className="ab-identity-title">{title}</span>
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
        <span>
          {" "}
          · title: {titleSourceLabel(ctx?.product_title_source || "unknown")}
          {ctx?.title_confidence === "low" ? " (низкая)" : ""}
        </span>
      </div>

      {isWw ? (
        <div className="ab-identity-decor">
          {hasDecor ? (
            <>
              <span className="ab-decor-label">роспись/мотив:</span>{" "}
              <span className={ctx?.decor_mismatch ? "ab-decor-mismatch" : ""}>{ctx?.decor_motif}</span>
              {ctx?.decor_motif_expected && ctx?.decor_motif_observed && !ctx.decor_mismatch ? (
                <span className="ab-identity-meta">
                  {" "}
                  (SKU: {ctx.decor_motif_expected}
                  {ctx.decor_motif_observed !== ctx.decor_motif_expected
                    ? ` · страница: ${ctx.decor_motif_observed}`
                    : ""}
                  )
                </span>
              ) : null}
            </>
          ) : (
            <div className="ab-identity-warn ab-ww-warn">{WW_DECOR_MISSING}</div>
          )}
          {ctx?.decor_mismatch ? (
            <div className="ab-identity-warn ab-ww-warn">
              ⚠ SKU-префикс ({ctx.decor_motif_expected}) и legacy-страница ({ctx.decor_motif_observed}) — разные
              мотивы. Не approve только по форме; Needs review.
            </div>
          ) : null}
          {cardDecorHint && decorLow ? (
            <div className="ab-identity-meta ab-source-low">файл/чеклист: {cardDecorHint}</div>
          ) : null}
          <div className={`ab-identity-source ${decorLow ? "ab-source-low" : ""}`}>
            decor source: {decorSourceLabel(ctx?.decor_source || "unknown")}
            {decorLow ? " · низкая уверенность" : ""}
            {ctx?.decor_confidence === "high" ? " · высокая уверенность" : ""}
          </div>
        </div>
      ) : hasDecor ? (
        <div className="ab-identity-meta">
          декор: {ctx?.decor_motif} · {decorSourceLabel(ctx?.decor_source || "unknown")}
        </div>
      ) : null}

      <div className="ab-identity-source">title source: {titleSourceLabel(ctx?.product_title_source || "unknown")}</div>
    </div>
  )
}
