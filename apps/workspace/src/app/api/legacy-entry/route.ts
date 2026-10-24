import { randomBytes } from "node:crypto";
import { legacyEntryResponse } from "@/server/legacy-entry.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const { body, ...init } = legacyEntryResponse(randomBytes(18).toString("base64"));
  return new Response(body, init);
}

export function HEAD() {
  const { body: _body, ...init } = legacyEntryResponse(randomBytes(18).toString("base64"));
  return new Response(null, init);
}
