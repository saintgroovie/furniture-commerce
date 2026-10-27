import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  upstream,
  verifiedBackend,
  LiveError,
} from "@/server/live.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await staff();
    await verifiedBackend();
    const result = await upstream("/admin/woodright/desk/order-catalog", {
      session,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError
            ? e.message
            : "Не удалось загрузить цены заказа",
      },
      { status: e instanceof LiveError ? e.status : 503, headers: NO_STORE },
    );
  }
}
