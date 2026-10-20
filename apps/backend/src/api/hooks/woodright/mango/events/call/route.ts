import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  DeskError,
  type Sql,
} from "../../../../../../lib/woodright-desk/commands";
import { receiveMangoCall } from "../../../../../../lib/woodright-desk/mango";
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (
    process.env.WOODRIGHT_MANGO_ENABLED !== "1" ||
    process.env.WOODRIGHT_DESK_FEATURES !== "1"
  ) {
    res.status(404).json({ message: "Not configured" });
    return;
  }
  try {
    const sql = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION,
    ) as Sql;
    await receiveMangoCall(sql, req.body, {
      apiKey: process.env.WOODRIGHT_MANGO_API_KEY || "",
      signingKey: process.env.WOODRIGHT_MANGO_SIGNING_KEY || "",
    });
    // Acknowledge only after the receipt and current call projection committed together.
    res.status(200).json({ result: 1000 });
  } catch (e) {
    res
      .status(e instanceof DeskError ? e.status : 503)
      .json({ code: e instanceof DeskError ? e.code : "MANGO_PERSISTENCE" });
  }
}
