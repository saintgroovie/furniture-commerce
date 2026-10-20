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
    const definitions = [
      ["products", "/admin/woodright/products", "products"],
      ["people", "/admin/leads", "leads"],
      ["requests", "/admin/bespoke-requests", "bespoke_requests"],
      ["orders", "/admin/orders", "orders"],
      ["processes", "/admin/woodright/order-processes", "order_processes"],
      ["rooms", "/admin/room-sets", "room_sets"],
    ] as const;
    const results = await Promise.allSettled(
      definitions.map(([key, path]) =>
        key === "orders"
          ? readPaged(path, "orders", session)
          : upstream(path, { session }),
      ),
    );
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
          completeness: key === "orders" ? "paginated" : "upstream-unpaginated",
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
    const data = projectLive(sources, session, states, {
      environment: identity.role,
      databaseAlias: identity.databaseAlias,
      backendRevision: identity.backendRevision,
      verifiedAt: identity.verifiedAt,
    });
    return NextResponse.json(
      { ...data, writeEnabled: process.env.WOODRIGHT_LIVE_WRITES === "1" },
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
