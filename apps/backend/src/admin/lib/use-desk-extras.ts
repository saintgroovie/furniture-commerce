import { useCallback, useEffect, useState } from "react"
import { adminJson, sellerErrorMessage } from "./admin-fetch"

export type DeskLead = {
  id: string
  source?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  comment?: string | null
  status?: string | null
}

export type DeskBespoke = {
  id: string
  lead_id: string
  product_id?: string | null
  comment?: string | null
  dimensions?: string | null
  materials?: string | null
  status: string
  internal_notes?: string | null
  quoted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type DeskProcess = {
  id: string
  order_id: string
  current_stage: string
  version?: number
  estimated_completion_date?: string | null
  customer_message?: string | null
}

export type DeskRoomSet = {
  id: string
  title: string
  slug: string
  room_type?: string | null
  is_active?: boolean
}

export type DeskPaymentLink = {
  id: string
  entity_type: string
  entity_id: string
  amount: number
  currency_code: string
  status: string
  purpose?: string | null
}

async function loadOrNote<T>(
  label: string,
  task: Promise<T>,
  fallback: T,
  failed: string[]
): Promise<T> {
  try {
    return await task
  } catch {
    failed.push(label)
    return fallback
  }
}

export function useDeskExtras() {
  const [leads, setLeads] = useState<DeskLead[]>([])
  const [requests, setRequests] = useState<DeskBespoke[]>([])
  const [processes, setProcesses] = useState<DeskProcess[]>([])
  const [rooms, setRooms] = useState<DeskRoomSet[]>([])
  const [links, setLinks] = useState<DeskPaymentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const failed: string[] = []
    try {
      const [leadJson, reqJson, procJson, roomJson, payJson] = await Promise.all([
        loadOrNote("люди", adminJson<{ leads: DeskLead[] }>("/admin/leads"), { leads: [] }, failed),
        loadOrNote(
          "заявки по проекту",
          adminJson<{ bespoke_requests: DeskBespoke[] }>("/admin/bespoke-requests"),
          { bespoke_requests: [] },
          failed
        ),
        loadOrNote(
          "производство",
          adminJson<{ order_processes: DeskProcess[] }>("/admin/woodright/order-processes"),
          { order_processes: [] },
          failed
        ),
        loadOrNote(
          "комнаты",
          adminJson<{ room_sets: DeskRoomSet[] }>("/admin/room-sets"),
          { room_sets: [] },
          failed
        ),
        loadOrNote(
          "счета",
          adminJson<{ payment_links: DeskPaymentLink[] }>("/admin/payment-links"),
          { payment_links: [] },
          failed
        ),
      ])
      setLeads(leadJson.leads ?? [])
      setRequests(reqJson.bespoke_requests ?? [])
      setProcesses(procJson.order_processes ?? [])
      setRooms(roomJson.room_sets ?? [])
      setLinks(payJson.payment_links ?? [])
      if (failed.length) {
        setError(`Не загрузились: ${failed.join(", ")}`)
      }
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить стол продавца"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { leads, requests, processes, rooms, links, loading, error, reload, setRequests }
}
