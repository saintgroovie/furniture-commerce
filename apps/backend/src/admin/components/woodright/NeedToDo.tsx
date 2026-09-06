import { Text } from "@medusajs/ui"
import { useNavigate } from "react-router-dom"
import type { AttentionCounts, AttentionFilter } from "../../../lib/woodright-admin/seller-product-types"

type Props = {
  attention: AttentionCounts | undefined
}

export function NeedToDo({ attention }: Props) {
  const navigate = useNavigate()
  if (!attention) return null

  const open = (filter: AttentionFilter) => {
    navigate(`/woodright/products?filter=${filter}`)
  }

  const showInvisible = attention.published_invisible > 0
  const showDrafts = attention.drafts > 0
  const showMedia = attention.missing_media > 0
  const showPrice = attention.missing_price > 0
  if (!showInvisible && !showDrafts && !showMedia && !showPrice) return null

  return (
    <div className="px-6 py-4">
      <Text weight="plus" className="mb-3">
        Нужно сделать
      </Text>
      <ul className="flex flex-col gap-2">
        {showInvisible && (
          <li>
            <button type="button" className="text-left" onClick={() => open("published_invisible")}>
              <Text>
                {attention.published_invisible} не показываются покупателям
              </Text>
            </button>
          </li>
        )}
        {showDrafts && (
          <li>
            <button type="button" className="text-left" onClick={() => open("drafts")}>
              <Text>{attention.drafts} черновиков не опубликованы</Text>
            </button>
          </li>
        )}
        {(showMedia || showPrice) && (
          <li className="flex flex-wrap gap-2">
            {showMedia && (
              <button type="button" className="text-left" onClick={() => open("missing_media")}>
                <Text>{attention.missing_media} без фото</Text>
              </button>
            )}
            {showMedia && showPrice && <Text>·</Text>}
            {showPrice && (
              <button type="button" className="text-left" onClick={() => open("missing_price")}>
                <Text>{attention.missing_price} без цены</Text>
              </button>
            )}
          </li>
        )}
      </ul>
    </div>
  )
}
