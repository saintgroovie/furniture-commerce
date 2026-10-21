import { NextResponse } from "next/server";
import {
  NO_STORE,
  staff,
  upstream,
  readPaged,
  LiveError,
  verifiedBackend,
} from "@/server/live.mjs";
import { projectLive } from "@/server/live-projection.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await staff();
    const identity = await verifiedBackend();
    await upstream("/admin/users/me", { session });
    const deskPromise = upstream("/admin/woodright/desk/capabilities", {
      session,
    }).catch((e: unknown) => {
      if (e instanceof LiveError && e.status === 401) throw e;
      return { contract: null };
    });
    const definitions = [
      ["products", "/admin/woodright/products", "products"],
      ["people", "/admin/leads", "leads"],
      ["requests", "/admin/bespoke-requests", "bespoke_requests"],
      ["orders", "/admin/orders", "orders"],
      ["processes", "/admin/woodright/order-processes", "order_processes"],
      ["rooms", "/admin/room-sets", "room_sets"],
    ] as const;
    const [results, desk] = await Promise.all([
      Promise.allSettled(
        definitions.map(([key, path, field]) =>
          ["orders", "people", "requests", "processes", "rooms"].includes(key)
            ? readPaged(path, field, session)
            : upstream(path, { session }),
        ),
      ),
      deskPromise,
    ]);
    const sources: Record<string, unknown> = {};
    const states: Record<string, unknown> = {};
    for (let i = 0; i < definitions.length; i++) {
      const [key, , field] = definitions[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        if (!Array.isArray(result.value[field])) {
          states[key] = {
            ok: false,
            message: "Формат ответа Medusa не поддерживается",
          };
          continue;
        }
        sources[key] = result.value;
        states[key] = {
          ok: true,
          count: result.value[field].length,
          total: result.value.count ?? null,
          truncated: result.value.truncated === true,
          completeness:
            key === "products" ? "upstream-unpaginated" : "paginated",
        };
      } else {
        if (result.reason instanceof LiveError && result.reason.status === 401)
          throw result.reason;
        states[key] = {
          ok: false,
          status: result.reason?.status || 502,
          message:
            result.reason instanceof LiveError
              ? result.reason.message
              : "Ошибка загрузки",
        };
      }
    }
    if (desk.contract === "woodright-desk-v1" && desk.reminders === true) {
      try {
        const reminders = await readPaged(
          "/admin/woodright/desk/reminders",
          "reminders",
          session,
        );
        sources.reminders = reminders;
        states.reminders = {
          ok: true,
          count: reminders.reminders.length,
          total: reminders.count,
          truncated: reminders.truncated,
          completeness: "paginated",
        };
      } catch (e) {
        if (e instanceof LiveError && e.status === 401) throw e;
        states.reminders = {
          ok: false,
          message: "Не удалось загрузить напоминания",
        };
      }
    }
    const data = projectLive(
      sources,
      session,
      states,
      {
        environment: identity.role,
        databaseAlias: identity.databaseAlias,
        backendRevision: identity.backendRevision,
        verifiedAt: identity.verifiedAt,
      },
      { ...desk, writesEnabled: process.env.WOODRIGHT_LIVE_WRITES === "1" },
    );
    return NextResponse.json(
      {
        ...data,
        writeEnabled:
          data.capabilities.crmCreate ||
          data.capabilities.requestUpdate ||
          data.capabilities.reminders ||
          data.capabilities.attachments,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return NextResponse.json(
      {
        message:
          e instanceof LiveError ? e.message : "Не удалось загрузить данные",
      },
      { status: e instanceof LiveError ? e.status : 500, headers: NO_STORE },
    );
  }
}
