import { titleSourceLabel } from "./approval-board-constants"
import type { SkuPoolContext } from "./approval-board-types"

type Props = {
  ctx: SkuPoolContext | undefined
  handle: string
  compact?: boolean
}

export function ProductIdentityBlock({ ctx, handle, compact }: Props) {
  const title = ctx?.product_title
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
        <div className="ab-identity-source">title source: unknown</div>
      </div>
    )
  }

  const sourceClass = ctx?.title_confidence === "low" ? "ab-source-low" : ""

  return (
    <div className={`ab-identity ${compact ? "ab-identity-compact" : ""}`}>
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
          · источник: {titleSourceLabel(ctx?.product_title_source || "unknown")}
          {ctx?.title_confidence === "low" ? " (низкая уверенность)" : ""}
        </span>
      </div>
      <div className="ab-identity-source">
        title source: {titleSourceLabel(ctx?.product_title_source || "unknown")}
      </div>
    </div>
  )
}
