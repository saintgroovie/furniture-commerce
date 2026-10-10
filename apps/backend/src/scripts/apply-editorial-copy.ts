/**
 * Editorial description importer (medusa exec). Writes `product.description` only.
 *
 *   EDITORIAL_COPY_INPUT=<path to editorial-copy-packet.json | rollback artifact>
 *   EDITORIAL_COPY_OUT_DIR=<dir for the report + rollback artifact>  (required for apply / rollback)
 *   + gate env (see apply-editorial-copy-gate.ts)
 *
 *   npx medusa exec ./src/scripts/apply-editorial-copy.ts
 *
 * Logic lives in `../lib/editorial-copy/run.ts`; this file only wires the container and files.
 * NEVER creates products, never touches title / handle / status / prices / options / media /
 * metadata / subtitle. Production requires the owner-approval confirm + ack (gate).
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { runEditorialCopy, type EditorialProductModule } from "../lib/editorial-copy/run"

export default async function applyEditorialCopy({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger") as { info: (s: string) => void }

  const inputPath = process.env.EDITORIAL_COPY_INPUT
  if (!inputPath) throw new Error("FAIL_CLOSED: EDITORIAL_COPY_INPUT is required")
  const input = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as unknown

  const mode = process.env.EDITORIAL_COPY_MODE
  const outDirEnv = process.env.EDITORIAL_COPY_OUT_DIR
  if ((mode === "apply" || mode === "rollback") && !outDirEnv) {
    throw new Error("FAIL_CLOSED: EDITORIAL_COPY_OUT_DIR is required for apply / rollback")
  }
  const outDir = resolve(outDirEnv ?? "tmp/editorial-copy")
  mkdirSync(outDir, { recursive: true })

  await runEditorialCopy({
    productModule: container.resolve(Modules.PRODUCT) as unknown as EditorialProductModule,
    env: process.env,
    input,
    writeJson: (name, data) => {
      const path = resolve(outDir, name)
      writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`)
      return path
    },
    log: (line) => logger.info(line),
    stamp: new Date().toISOString().replace(/[:.]/g, "-"),
  })
}
