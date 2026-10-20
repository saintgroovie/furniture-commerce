import { NextResponse } from "next/server";
import {
  COOKIE,
  NO_STORE,
  LiveError,
  staff,
  sameOrigin,
  upstream,
  verifiedBackend,
  encodeSession,
  cookieOptions,
} from "@/server/live.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await staff();
    return NextResponse.json({ email: session.email }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { message: "Нужен вход" },
      { status: 401, headers: NO_STORE },
    );
  }
}
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length")) > 8192)
      throw new LiveError(413, "Запрос слишком большой");
    const body = await readJsonBounded(request, 8192);
    if (body.intent === "logout") {
      const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
      response.cookies.set(COOKIE, "", {
        ...cookieOptions(request),
        maxAge: 0,
      });
      return response;
    }
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (
      !email ||
      email.length > 254 ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 1024
    )
      throw new LiveError(400, "Укажите email и пароль");
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    const attempt = attempts.get(email);
    if (attempt && attempt.count >= 5)
      throw new LiveError(
        429,
        "Слишком много попыток. Повторите через 10 минут",
      );
    attempts.set(email, {
      count: (attempt?.count || 0) + 1,
      until: attempt?.until || now + 600000,
    });
    await verifiedBackend();
    let auth;
    try {
      auth = await upstream("/auth/user/emailpass", {
        method: "POST",
        body: { email, password: body.password },
      });
    } catch (e) {
      if (e instanceof LiveError && e.status === 401)
        throw new LiveError(401, "Проверьте email и пароль сотрудника Medusa");
      throw e;
    }
    if (typeof auth.token !== "string")
      throw new LiveError(502, "Medusa не подтвердила вход");
    await upstream("/admin/users/me", {
      session: { token: auth.token, email },
    });
    const cookie = encodeSession({ kind: "medusa", email, token: auth.token });
    if (!cookie) throw new LiveError(503, "Сессионный ключ OS не настроен");
    attempts.delete(email);
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    response.cookies.set(COOKIE, cookie, cookieOptions(request));
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось выполнить вход",
      },
      { status: e instanceof LiveError ? e.status : 400, headers: NO_STORE },
    );
  }
}
