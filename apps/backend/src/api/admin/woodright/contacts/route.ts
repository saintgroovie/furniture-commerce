import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  mergeStagedSiteContacts,
  parseWoodrightSiteContacts,
  readStagedSiteContacts,
  WOODRIGHT_CONTACTS_SOURCE_STATUS,
} from "../../../../lib/woodright-admin/site-contacts"

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

/**
 * Staged contacts document. Not live on the public storefront.
 * GET /admin/woodright/contacts
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModule = req.scope.resolve(Modules.STORE) as StoreModule
  const store = await loadDefaultStore(storeModule)
  const contacts = readStagedSiteContacts(store?.metadata ?? null)
  res.json({
    configured: Boolean(contacts),
    source_status: WOODRIGHT_CONTACTS_SOURCE_STATUS,
    live: false,
    contacts,
  })
}

/**
 * Save staged contacts. Does not switch the public storefront.
 * PUT /admin/woodright/contacts
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const parsed = parseWoodrightSiteContacts(req.body)
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
    res.status(500).json({ code: "store_missing", message: "Не удалось сохранить контакты" })
    return
  }

  const metadata = mergeStagedSiteContacts(store.metadata ?? {}, parsed.value)
  await storeModule.updateStores(store.id, { metadata })

  res.json({
    configured: true,
    source_status: WOODRIGHT_CONTACTS_SOURCE_STATUS,
    live: false,
    contacts: parsed.value,
    message: "Настройки сохранены, но пока не используются публичным сайтом",
  })
}
