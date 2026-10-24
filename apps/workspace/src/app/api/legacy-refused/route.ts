import { legacyRefusedResponse } from "@/server/legacy-entry.mjs";

export const dynamic = "force-dynamic";

function refuse() {
  const { body, ...init } = legacyRefusedResponse();
  return new Response(body, init);
}

export const GET = refuse;
export const POST = refuse;
export const PUT = refuse;
export const PATCH = refuse;
export const DELETE = refuse;
export const OPTIONS = refuse;

export function HEAD() {
  const { body: _body, ...init } = legacyRefusedResponse();
  return new Response(null, init);
}
