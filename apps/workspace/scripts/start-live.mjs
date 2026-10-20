import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const local = process.env.WOODRIGHT_WORKSPACE_RUNTIME === "local-private";
if (!process.env.WOODRIGHT_WORKSPACE_SESSION_SECRET && !local)
  throw new Error("WOODRIGHT_WORKSPACE_SESSION_SECRET is required");
const env = {
  ...process.env,
  WOODRIGHT_WORKSPACE_SESSION_SECRET:
    process.env.WOODRIGHT_WORKSPACE_SESSION_SECRET ||
    randomBytes(48).toString("base64url"),
};
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PORT || "4320",
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
