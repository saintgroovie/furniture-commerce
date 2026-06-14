import { NextResponse } from "next/server"

export function matrixBoardProdBlocked(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.WW_FLOW_A_MATRIX_BOARD_ALLOW_PROD !== "1"
  )
}

export function matrixBoardProdBlockedResponse(): NextResponse {
  return NextResponse.json({ error: "prod_blocked" }, { status: 403 })
}
