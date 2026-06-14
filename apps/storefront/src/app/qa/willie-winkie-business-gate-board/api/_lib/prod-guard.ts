import { NextResponse } from "next/server"

export function gateBoardProdBlocked(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.WW_BUSINESS_GATE_BOARD_ALLOW_PROD !== "1"
  )
}

export function gateBoardProdBlockedResponse(): NextResponse {
  return NextResponse.json({ error: "prod_blocked" }, { status: 403 })
}
