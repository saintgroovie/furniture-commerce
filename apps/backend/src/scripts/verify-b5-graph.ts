import type { ExecArgs } from "@medusajs/framework/types"

const IDS = [
  "prod_01KX9PD26JVQJS4M811SPZZRDV",
  "prod_01KX9PMKT63Z9FWR9XYXEARY0B",
  "prod_01KX9PR0S4XQ2YZ1MCD3FG8W25",
  "prod_01KX9PR14G92411WTRYWZAVNHJ",
  "prod_01KX9PR1TFV6QCYEQ0V8T1A34Y",
]

export default async function verifyB5Graph({ container }: ExecArgs) {
  const query = container.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  for (const id of IDS) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "status",
        "thumbnail",
        "images.id",
        "variants.id",
        "product_classification.product_type",
      ],
      filters: { id },
    })
    const p = (data?.[0] ?? {}) as Record<string, unknown>
    const cls = p.product_classification as { product_type?: string } | null
    const images = p.images as unknown[] | undefined
    console.log(
      JSON.stringify({
        id,
        title: p.title,
        status: p.status,
        type: cls?.product_type ?? null,
        thumb: !!p.thumbnail,
        images: images?.length ?? 0,
      })
    )
  }
}
