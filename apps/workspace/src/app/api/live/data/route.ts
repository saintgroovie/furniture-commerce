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
      ["orders", "/admin/woodright/desk/orders", "orders"],
      ["processes", "/admin/woodright/order-processes", "order_processes"],
      ["rooms", "/admin/room-sets", "room_sets"],
    ] as const;
    const desk = await deskPromise;
    const allDefinitions = definitions;
    const visibleDefinitions = allDefinitions.filter(([key]) =>
      desk.access?.role === "production"
        ? false
        : desk.access?.role === "accountant"
          ? ["orders", "processes"].includes(key)
          : true,
    );
    const results = await Promise.allSettled(
      visibleDefinitions.map(([key, path, field]) =>
        ["orders", "people", "requests", "processes", "rooms"].includes(key)
          ? readPaged(path, field, session)
          : upstream(path, { session }),
      ),
    );
    const sources: Record<string, unknown> = {};
    const states: Record<string, unknown> = {};
    for (const [key, , field] of allDefinitions) {
      if (!visibleDefinitions.some(([visible]) => visible === key)) {
        sources[key] = { [field]: [], count: 0 };
        states[key] = { ok: true, count: 0, total: 0, restricted: true };
      }
    }
    if (desk.access?.role === "production") {
      const workload = await upstream("/admin/woodright/desk/production", {
        session,
      });
      for (const key of ["requests", "orders", "processes", "companies"]) {
        sources[key] = workload[key];
        states[key] = {
          ok: true,
          count: workload[key].count,
          total: workload[key].count,
          completeness: "assigned",
        };
      }
    }
    for (let i = 0; i < visibleDefinitions.length; i++) {
      const [key, , field] = visibleDefinitions[i];
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
    if (desk.companies === true || desk.access) {
      const allTeamDefinitions = [
        ["companies", "companies"],
        ["records", "records"],
        ["staff", "staff"],
      ] as const;
      const definitions = allTeamDefinitions.filter(
        ([key]) => key !== "companies" || desk.companies === true,
      );
      const loaded = await Promise.allSettled(
        definitions.map(([path, field]) =>
          readPaged(`/admin/woodright/desk/${path}`, field, session),
        ),
      );
      loaded.forEach((result, i) => {
        const [key, field] = definitions[i];
        if (result.status === "fulfilled") {
          sources[key] = result.value;
          states[key] = {
            ok: true,
            count: result.value[field].length,
            total: result.value.count,
            truncated: result.value.truncated,
            completeness: "paginated",
          };
        } else {
          if (
            result.reason instanceof LiveError &&
            result.reason.status === 401
          )
            throw result.reason;
          states[key] = {
            ok: false,
            message: "Не удалось загрузить данные команды",
          };
        }
      });
    }
    if (desk.invoiceRead === true) {
      try {
        const invoices = await readPaged(
          "/admin/woodright/desk/invoices",
          "invoices",
          session,
        );
        sources.invoices = invoices;
        states.invoices = {
          ok: true,
          count: invoices.invoices.length,
          total: invoices.count,
          truncated: invoices.truncated,
          completeness: "paginated",
        };
      } catch (e) {
        if (e instanceof LiveError && e.status === 401) throw e;
        states.invoices = { ok: false, message: "Не удалось загрузить счета" };
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
