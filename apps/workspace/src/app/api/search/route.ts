import { NextResponse } from "next/server"
import { loadSearch } from "@/server/loaders"

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? ""
  const result = await loadSearch(q)
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status })
  }
  return NextResponse.json({ hits: result.data.hits })
}
