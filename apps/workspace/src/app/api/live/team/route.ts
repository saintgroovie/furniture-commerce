import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  sameOrigin,
  upstream,
  verifiedBackend,
  LiveError,
} from "@/server/live.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
import { BASE_PATH } from "@/lib/paths.mjs";
export async function GET() {
  try {
    const session = await staff();
    await verifiedBackend();
    const result = await upstream("/admin/invites?limit=100&offset=0", {
      session,
    });
    return NextResponse.json(
      {
        invitations: result.invites
          .filter((i: { accepted: boolean }) => !i.accepted)
          .map((i: { id: string; email: string; expires_at: string }) => ({
            id: i.id,
            email: i.email,
            expiresAt: i.expires_at,
          })),
        count: result.count,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return NextResponse.json(
      {
        message: e instanceof LiveError ? e.message : "Приглашения недоступны",
      },
      { status: e instanceof LiveError ? e.status : 400, headers: NO_STORE },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await staff();
    await verifiedBackend();
    if (process.env.WOODRIGHT_LIVE_WRITES !== "1")
      throw new LiveError(403, "Приглашения ещё не включены");
    const body = await readJsonBounded(request, 8192);
    if (
      body.intent === "revoke" &&
      typeof body.id === "string" &&
      /^[\w-]{1,160}$/.test(body.id)
    ) {
      await upstream(`/admin/invites/${body.id}`, {
        session,
        method: "DELETE",
      });
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (
      body.intent !== "invite" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new LiveError(400, "Укажите рабочий email сотрудника");
    // Reuse an outstanding invite after a lost response; do not issue duplicate links or send mail.
    const current = await upstream(
      `/admin/invites?email=${encodeURIComponent(email)}&limit=100`,
      { session },
    );
    let invite = current.invites?.find(
      (i: { accepted: boolean; expires_at: string }) =>
        !i.accepted && Date.parse(i.expires_at) > Date.now(),
    );
    if (!invite && current.invites?.length)
      invite = (
        await upstream(
          `/admin/invites/${encodeURIComponent(current.invites[0].id)}/resend`,
          { session, method: "POST" },
        )
      ).invite;
    if (!invite)
      invite = (
        await upstream("/admin/invites", {
          session,
          method: "POST",
          body: { email },
        })
      ).invite;
    if (!invite?.token)
      throw new LiveError(502, "Medusa не вернула ссылку приглашения");
    const origin = process.env.WOODRIGHT_WORKSPACE_ORIGIN;
    if (!origin) throw new LiveError(503, "Адрес OS не настроен");
    return NextResponse.json(
      {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expires_at,
        url: `${origin}${BASE_PATH}/#/join/${encodeURIComponent(invite.token)}`,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError
            ? e.message
            : "Не удалось подготовить приглашение",
      },
      { status: e instanceof LiveError ? e.status : 400, headers: NO_STORE },
    );
  }
}
