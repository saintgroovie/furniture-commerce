import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  publicPartners,
  readPartnersDocument,
} from "../../../lib/woodright-admin/site-partners"

type StoreRow = {
  id: string
  metadata?: Record<string, unknown> | null
}

type StoreModule = {
  listStores: (
    filters?: Record<string, unknown>,
    config?: { take?: number }
  ) => Promise<StoreRow[]>
}

async function loadDefaultStore(storeModule: StoreModule): Promise<StoreRow | null> {
  const stores = await storeModule.listStores({}, { take: 1 })
  return stores?.[0] ?? null
}

/** GET /store/partners - active partners only. Empty list if none are published. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModule = req.scope.resolve(Modules.STORE) as StoreModule
  const store = await loadDefaultStore(storeModule)
  const document = readPartnersDocument(store?.metadata ?? null)
  res.json({ partners: publicPartners(document) })
}
