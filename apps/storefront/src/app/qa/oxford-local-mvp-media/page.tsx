import type { Metadata } from "next"
import { getOxfordLocalMvpMediaPreview } from "@/lib/qa/oxford-local-mvp-media"

export const metadata: Metadata = {
  title: "Oxford local MVP media — QA preview",
  description:
    "Локальный QA/preview плана Oxford media (assignment plan + Medusa Store, если доступен). Не production catalog и не unpause Oxford.",
}

function toText(value: unknown): string {
  if (value == null) return "—"
  if (typeof value === "string" && value.trim() === "") return "—"
  return String(value)
}

export default async function OxfordLocalMvpMediaQaPage() {
  const { plan, productsByHandle, summary } = await getOxfordLocalMvpMediaPreview()
  const rows = plan?.rows ?? []

  return (
    <div>
      <h1>Oxford local MVP media — QA preview</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        Страница для локальной разработки: показывает строки из{" "}
        <code>data/normalized/oxford-local-mvp-media-assignment-plan.json</code> и, при доступном
        Store API, текущие товары Medusa по handle. Oxford остаётся PAUSED в общем каталоге; это не
        rollout и не production readiness.
      </p>

      {!plan && (
        <div className="status-message" style={{ marginTop: "1rem" }}>
          <p>
            <strong>Plan not found on disk.</strong> Сгенерируйте артефакты из корня репозитория:{" "}
            <code>node scripts/build-oxford-local-mvp-media-artifacts.mjs</code> или{" "}
            <code>yarn oxford-local-mvp-media:build</code> из <code>apps/backend</code>.
          </p>
        </div>
      )}

      {plan && (
        <div className="status-message" style={{ marginTop: "1rem" }}>
          <p>
            <strong>Plan rows:</strong> {summary.plan_row_count} · <strong>Medusa matches (this request):</strong>{" "}
            {summary.medusa_products_found} · <strong>Rows flagged apply-eligible in plan:</strong>{" "}
            {summary.apply_allowed_rows}
          </p>
          <p className="info-text" style={{ marginTop: "0.35rem" }}>
            Interim / PDF / legacy ссылки — только локальный preview; не white-background readiness.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: "1.25rem", overflowX: "auto" }}>
          <table className="info-text" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>Handle</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>In Medusa</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>Proposed primary</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>Gallery #</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>Backlog #</th>
                <th style={{ textAlign: "left", padding: "0.35rem", borderBottom: "1px solid #ccc" }}>Apply (plan)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const med = productsByHandle[r.handle] ?? null
                const thumb = typeof med?.thumbnail === "string" ? med.thumbnail : null
                return (
                  <tr key={`${r.sku}-${r.handle}`}>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {toText(r.sku)}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {toText(r.handle)}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {r.product_in_local_medusa_db ? "yes" : "no"}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top", maxWidth: "22rem" }}>
                      <div style={{ wordBreak: "break-all", fontSize: "0.85rem" }}>{toText(r.proposed_primary_url)}</div>
                      {thumb && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <span style={{ fontSize: "0.8rem" }}>Store thumb:</span>
                          <img src={thumb} alt="" width={72} height={72} style={{ display: "block", marginTop: "0.2rem" }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {(r.proposed_gallery_urls ?? []).length}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {(r.gallery_review_backlog_urls ?? []).length}
                    </td>
                    <td style={{ padding: "0.35rem", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      {r.local_mvp_apply_allowed ? "yes" : "no"}
                      {r.apply_skip_reason ? (
                        <div style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>{r.apply_skip_reason}</div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
