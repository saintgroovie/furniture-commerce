import { NextResponse } from "next/server";
import {
  COOKIE,
  NO_STORE,
  staff,
  sameOrigin,
  upstream,
  verifiedBackend,
  LiveError,
  cookieOptions,
} from "@/server/live.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await staff();
    await verifiedBackend();
    const body = await readJsonBounded(request, 8192);
    await upstream("/admin/woodright/desk/password", {
      session,
      method: "POST",
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      },
    });
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    response.cookies.set(COOKIE, "", { ...cookieOptions(request), maxAge: 0 });
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось изменить пароль",
      },
      { status: e instanceof LiveError ? e.status : 400, headers: NO_STORE },
    );
  }
}
