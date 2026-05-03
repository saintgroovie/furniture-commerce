import type { Metadata } from "next"
import Link from "next/link"
import { getProducts } from "@/lib/api/products"
import { resolveKidsProducts } from "@/lib/kids"
import { BESPOKE_PRODUCT_TYPE, resolveBespokeProducts } from "@/lib/bespoke"
import { groupProductsForDisplay } from "@/lib/display-group"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"
import {
  buildCatalogMediaDebugRows,
  buildUngroupedListingDebugRows,
  memberMergedExtraCountForProduct,
} from "@/lib/catalog-media-debug"
import {
  buildBrokenExtrasCandidateRows,
  DEFAULT_BROKEN_EXTRAS_WATCH_HANDLES,
} from "@/lib/catalog-broken-extras-report"

export const metadata: Metadata = {
  title: "Catalog media debug — Woodright",
  description:
    "Read-only QA: card media diagnostics for /catalog pipeline. Not a public catalog feature.",
}

async function mainCatalogDisplayEntries() {
  const data = await getProducts()
  const products = data.products ?? []
  const allRaw = Array.isArray(products) ? products : []

  let kidsIds: Set<string>
  try {
    kidsIds = (
      await resolveKidsProducts({
        storeProducts: allRaw as Record<string, unknown>[],
      })
    ).ids
  } catch {
    kidsIds = new Set()
  }

  const all = allRaw.filter(
    (p: Record<string, unknown>) =>
      !kidsIds.has(p.id as string) &&
      (p.product_classification as { product_type?: string } | undefined)?.product_type !==
        BESPOKE_PRODUCT_TYPE &&
      isProductInActiveCatalogScope(p) &&
      !isMedusaCanonicalSeedDemoProduct(p)
  )

  return groupProductsForDisplay(all as Record<string, unknown>[])
}

function Table({
  title,
  rows,
}: {
  title: string
  rows: ReturnType<typeof buildCatalogMediaDebugRows>
}) {
  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>{title}</h2>
      <p className="info-text" style={{ marginTop: "0.35rem", maxWidth: "56rem" }}>
        Локальная диагностика: те же поля, что считает non-Oliver карточка (без рендера). Причина —
        эвристика по данным Store API, не замена ручной проверки.
      </p>
      <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
        <table className="catalog-media-debug-table">
          <thead>
            <tr>
              <th>handle</th>
              <th>collection</th>
              <th>display_group</th>
              <th>scope</th>
              <th>members</th>
              <th>thumb</th>
              <th>rep images</th>
              <th>dg_extra len</th>
              <th>own extra</th>
              <th>total extra</th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.handle}</td>
                <td>{r.collection ?? "—"}</td>
                <td>{r.display_group ?? "—"}</td>
                <td>{r.in_catalog_scope ? "in" : "out"}</td>
                <td>{r.group_member_count}</td>
                <td>{r.representative_thumbnail_present ? "yes" : "no"}</td>
                <td>{r.representative_images_length}</td>
                <td>{r.display_group_extra_image_urls_length}</td>
                <td>{r.own_extra_urls_length}</td>
                <td>{r.total_extra_srcs_length}</td>
                <td>
                  <code>{r.suspected_reason}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: "0.75rem" }}>
        <summary>JSON (первые 12 строк)</summary>
        <pre style={{ fontSize: "11px", maxHeight: "18rem", overflow: "auto" }}>
          {JSON.stringify(rows.slice(0, 12), null, 2)}
        </pre>
      </details>
    </section>
  )
}

export default async function CatalogMediaDebugPage() {
  let catalogRows: ReturnType<typeof buildCatalogMediaDebugRows> = []
  let bespokeGroupedRows: ReturnType<typeof buildCatalogMediaDebugRows> = []
  let bespokeUngroupedRows: ReturnType<typeof buildCatalogMediaDebugRows> = []
  let pausedSamples: Array<{
    handle: string
    collection: string | null
    mergedIfGrouped: number
    memberCount: number
  }> = []
  let brokenExtrasRows: ReturnType<typeof buildBrokenExtrasCandidateRows> = []

  try {
    const entries = await mainCatalogDisplayEntries()
    catalogRows = buildCatalogMediaDebugRows(entries)

    const bespoke = await resolveBespokeProducts()
    bespokeGroupedRows = buildCatalogMediaDebugRows(
      groupProductsForDisplay(bespoke.products)
    )
    bespokeUngroupedRows = buildUngroupedListingDebugRows(bespoke.products)

    const data = await getProducts()
    const all = (data.products ?? []) as Record<string, unknown>[]
    brokenExtrasRows = buildBrokenExtrasCandidateRows(
      all,
      new Set(DEFAULT_BROKEN_EXTRAS_WATCH_HANDLES.map((h) => h.toLowerCase()))
    )
    for (const p of all) {
      if (isProductInActiveCatalogScope(p)) continue
      if (isMedusaCanonicalSeedDemoProduct(p)) continue
      const h = typeof p.handle === "string" ? p.handle : ""
      const meta = p.metadata as Record<string, unknown> | undefined
      const coll = typeof meta?.collection === "string" ? meta.collection : null
      const { mergedExtraLen, memberCount } = memberMergedExtraCountForProduct(p, all)
      pausedSamples.push({
        handle: h || "—",
        collection: coll,
        mergedIfGrouped: mergedExtraLen,
        memberCount,
      })
      if (pausedSamples.length >= 12) break
    }
  } catch {
    return (
      <div data-state="error" className="status-message">
        <h1>Catalog media debug</h1>
        <p>Не удалось загрузить товары (Store API).</p>
        <Link href="/catalog">В каталог</Link>
      </div>
    )
  }

  return (
    <div data-state="success" style={{ padding: "1rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Catalog media debug</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        QA-страница: только чтение данных, без записи. Сравните с витриной{" "}
        <Link href="/catalog">/catalog</Link> и{" "}
        <Link href="/bespoke/catalog">/bespoke/catalog</Link>.
      </p>
      <p className="info-text" style={{ marginTop: "0.35rem" }}>
        Коллекции <code>provence</code> и <code>country-london-paris</code> в{" "}
        <code>catalog-scope</code> помечены как <strong>paused</strong> — на{" "}
        <code>/catalog</code> они не попадают; см. блок «вне scope» ниже.
      </p>

      <Table title="Пайплайн как у /catalog (groupProductsForDisplay)" rows={catalogRows} />

      <Table
        title="Bespoke: после groupProductsForDisplay (как на витрине сейчас)"
        rows={bespokeGroupedRows}
      />

      <Table
        title="Bespoke: симуляция старого списка без группировки (members_not_loaded)"
        rows={bespokeUngroupedRows}
      />

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Broken extras candidates (watch handles)</h2>
        <p className="info-text" style={{ marginTop: "0.35rem", maxWidth: "56rem" }}>
          Read-only: фактические URL, попадающие в <code>mergeUniqueExtraUrls</code> для
          representative группы (как на карточке). Статическая классификация URL — эвристика
          (например <code>/uploads/</code> часто ломается на origin витрины). Реальная
          загрузка на карточке теперь фильтруется через <code>Image()</code> verify.
        </p>
        <p className="info-text" style={{ marginTop: "0.25rem" }}>
          Handles: {DEFAULT_BROKEN_EXTRAS_WATCH_HANDLES.join(", ")}
        </p>
        {brokenExtrasRows.length === 0 ? (
          <p className="info-text" style={{ marginTop: "0.5rem" }}>
            Ни один watch-handle не найден в текущем ответе Store (проверьте окружение / сид).
          </p>
        ) : (
          <details open style={{ marginTop: "0.75rem" }}>
            <summary>JSON отчёт</summary>
            <pre style={{ fontSize: "11px", maxHeight: "28rem", overflow: "auto" }}>
              {JSON.stringify(brokenExtrasRows, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Примеры вне active catalog-scope (paused / др.)</h2>
        <p className="info-text" style={{ marginTop: "0.35rem", maxWidth: "56rem" }}>
          До 12 товаров, отфильтрованных <code>isProductInActiveCatalogScope === false</code>.{" "}
          <code>mergedIfGrouped</code> — сколько extra URL дал бы{" "}
          <code>collectDisplayGroupExtraImageUrls</code> по полной группе в Store.
        </p>
        <ul style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
          {pausedSamples.map((s) => (
            <li key={s.handle}>
              <code>{s.handle}</code> · collection <code>{s.collection ?? "—"}</code> · members{" "}
              {s.memberCount} · merged extras if grouped: {s.mergedIfGrouped}
            </li>
          ))}
        </ul>
      </section>

      <div className="nav-links" style={{ marginTop: "2rem" }}>
        <Link href="/catalog">В каталог</Link>
      </div>
    </div>
  )
}
