import { formatRub } from "@/lib/format"
import type { PriceConflict } from "@/lib/price-presentation"

/**
 * 409 on price: the server amount and the employee amount side by side.
 * Nothing is overwritten silently; the employee re-reads and decides.
 */
export function ConflictPanel({ conflict, refreshHref }: { conflict: PriceConflict; refreshHref: string }) {
  return (
    <div className="price-conflict" role="alert">
      <div className="price-col">
        <span className="meta">Цена уже изменена другим сотрудником</span>
        <span className="meta">На сервере сейчас</span>
        <span className="money-lg">{conflict.server_amount != null ? formatRub(conflict.server_amount) : "неизвестно"}</span>
      </div>
      <div className="price-col">
        <span className="meta">Вы хотели сохранить</span>
        <span className="money-lg">{conflict.your_amount != null ? formatRub(conflict.your_amount) : "не распознано"}</span>
        <a className="btn btn-secondary sm" href={refreshHref}>Обновить данные</a>
      </div>
    </div>
  )
}
