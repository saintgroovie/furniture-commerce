import { NextResponse } from "next/server";
import { NO_STORE, sameOrigin } from "@/server/live.mjs";
import { catalogContext, catalogFailure } from "@/server/catalog.mjs";
import {
  readCatalog,
  editorSnapshot,
  executeCatalog,
} from "@/server/catalog-service.mjs";
import { CATALOG_COLLECTIONS } from "@/server/catalog-policy.mjs";
import { readJsonBounded } from "@/server/request-policy.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { send } = await catalogContext();
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(
      {
        product: id ? editorSnapshot(await readCatalog(id, send)) : null,
        collections: CATALOG_COLLECTIONS,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    const failure = catalogFailure(e);
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: NO_STORE },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { send } = await catalogContext(true);
    const command = await readJsonBounded(request, 128 * 1024);
    const product = await executeCatalog(command, send);
    return NextResponse.json({ product }, { headers: NO_STORE });
  } catch (e) {
    const failure = catalogFailure(e);
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: NO_STORE },
    );
  }
}
