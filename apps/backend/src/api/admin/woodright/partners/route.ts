import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  mergePartnersDocument,
  parseWoodrightPartners,
  readPartnersDocument,
} from "../../../../lib/woodright-admin/site-partners"

type StoreRow = {
  id: string
  metadata?: Record<string, unknown> | null
}

type StoreModule = {
  listStores: (
    filters?: Record<string, unknown>,
    config?: { take?: number }
  ) => Promise<StoreRow[]>
  updateStores: (id: string, data: { metadata: Record<string, unknown> }) => Promise<unknown>
}

async function loadDefaultStore(storeModule: StoreModule): Promise<StoreRow | null> {
  const stores = await storeModule.listStores({}, { take: 1 })
  return stores?.[0] ?? null
}

/** GET /admin/woodright/partners */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModule = req.scope.resolve(Modules.STORE) as StoreModule
  const store = await loadDefaultStore(storeModule)
  const document = readPartnersDocument(store?.metadata ?? null)
  res.json({
    schema_version: document.schema_version,
    partners: document.partners,
  })
}

/** PUT /admin/woodright/partners */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const parsed = parseWoodrightPartners(req.body)
  if (!parsed.ok) {
    res.status(400).json({
      code: parsed.code,
      message: parsed.message,
      field: parsed.field,
    })
    return
  }

  const storeModule = req.scope.resolve(Modules.STORE) as StoreModule
  const store = await loadDefaultStore(storeModule)
  if (!store?.id) {
    res.status(500).json({ code: "store_missing", message: "Не удалось сохранить партнёров" })
    return
  }

  const metadata = mergePartnersDocument(store.metadata ?? {}, parsed.value)
  await storeModule.updateStores(store.id, { metadata })

  res.json({
    schema_version: parsed.value.schema_version,
    partners: parsed.value.partners,
    message: "Список партнёров сохранён",
  })
}
