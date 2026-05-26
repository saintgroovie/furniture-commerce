import { NextResponse } from "next/server"
import { legacyMediaQaProdBlocked, readNormalizedJsonPassthrough } from "../_lib/normalized-json-route"

export const dynamic = "force-dynamic"

const REL = "data/normalized/legacy-media-product-candidate-map.json"

export async function GET(): Promise<Response> {
  if (legacyMediaQaProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }
  return readNormalizedJsonPassthrough(REL)
}
