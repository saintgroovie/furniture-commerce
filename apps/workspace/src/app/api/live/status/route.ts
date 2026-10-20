import { NextResponse } from "next/server";
import { NO_STORE, verifiedBackend } from "@/server/live.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const identity = await verifiedBackend();
    return NextResponse.json(
      {
        connected: true,
        environment: identity.role,
        writeEnabled: process.env.WOODRIGHT_LIVE_WRITES === "1",
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { connected: false, environment: "unverified", writeEnabled: false },
      { status: 503, headers: NO_STORE },
    );
  }
}
