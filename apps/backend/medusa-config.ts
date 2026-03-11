import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    http: {
      storeCors: process.env.STORE_CORS ?? "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS ?? "http://localhost:7001,http://localhost:9000",
      authCors: process.env.AUTH_CORS ?? "http://localhost:3000,http://localhost:7001",
      jwtSecret: process.env.JWT_SECRET ?? "supersecret-min-32-chars-required",
      cookieSecret: process.env.COOKIE_SECRET ?? "supersecret-cookie-min-32",
    },
  },
  modules: [
    {
      resolve: "./src/modules/product-extension",
    },
    {
      resolve: "./src/modules/room-set",
    },
    {
      resolve: "./src/modules/lead",
    },
    {
      resolve: "./src/modules/bespoke-request",
    },
    {
      resolve: "./src/modules/payment-link",
    },
  ],
})
