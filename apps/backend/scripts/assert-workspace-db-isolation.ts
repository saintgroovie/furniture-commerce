import { loadEnv } from "@medusajs/framework/utils"
import { decideWorkspaceDbIsolation } from "../src/lib/woodright-workspace/db-isolation"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const decision = decideWorkspaceDbIsolation(process.env)
if (!decision.ok) {
  console.error(`workspace migration refused: ${decision.reason}`)
  process.exit(1)
}
console.log(`workspace migration allowed database=${decision.database} port=${decision.port}`)
