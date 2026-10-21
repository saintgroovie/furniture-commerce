import { NextResponse } from "next/server";
import {
  COOKIE,
  NO_STORE,
  sameOrigin,
  upstream,
  verifiedBackend,
  LiveError,
  encodeSession,
  cookieOptions,
} from "@/server/live.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readJsonBounded(request, 8192);
    await verifiedBackend();
    const token = body.token;
    if (typeof token !== "string" || token.length > 4096 || token.length < 40)
      throw new LiveError(400, "Откройте ссылку приглашения полностью");
    const key = token.slice(-80),
      now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    if ((attempts.get(key)?.count ?? 0) >= 10 || attempts.size > 10000)
      throw new LiveError(429, "Слишком много попыток. Повторите позже.");
    attempts.set(key, {
      count: (attempts.get(key)?.count ?? 0) + 1,
      until: now + 600000,
    });
    const invite = await upstream("/woodright/team-invitation", {
      method: "POST",
      body: { token },
    });
    if (body.intent === "inspect")
      return NextResponse.json(invite, { headers: NO_STORE });
    if (
      body.intent !== "accept" ||
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 1024 ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 160
    )
      throw new LiveError(400, "Укажите имя и пароль от 12 символов");
    const credentials = { email: invite.email, password: body.password };
    let auth;
    try {
      auth = await upstream("/auth/user/emailpass/register", {
        method: "POST",
        body: credentials,
      });
    } catch (e) {
      if (!(e instanceof LiveError) || ![400, 409].includes(e.status)) throw e;
      auth = await upstream("/auth/user/emailpass", {
        method: "POST",
        body: credentials,
      });
    }
    if (typeof auth.token !== "string")
      throw new LiveError(502, "Medusa не подтвердила регистрацию");
    await upstream("/woodright/team-invitation/accept", {
      session: { token: auth.token, email: invite.email },
      method: "POST",
      body: { token, name: body.name.trim() },
    });
    const logged = await upstream("/auth/user/emailpass", {
      method: "POST",
      body: credentials,
    });
    await upstream("/admin/users/me", {
      session: { token: logged.token, email: invite.email },
    });
    const cookie = encodeSession({
      kind: "medusa",
      email: invite.email,
      token: logged.token,
    });
    if (!cookie) throw new LiveError(503, "Сессионный ключ OS не настроен");
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    response.cookies.set(COOKIE, cookie, cookieOptions(request));
    attempts.delete(key);
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось принять приглашение",
      },
      { status: e instanceof LiveError ? e.status : 400, headers: NO_STORE },
    );
  }
}
