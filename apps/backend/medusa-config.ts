import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS ?? "http://localhost:8000,http://127.0.0.1:8000",
      adminCors: process.env.ADMIN_CORS ?? "http://localhost:5173,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:9000",
      authCors: process.env.AUTH_CORS ?? "http://localhost:5173,http://localhost:8000,http://localhost:9000,http://127.0.0.1:8000,http://127.0.0.1:9000",
      jwtSecret: process.env.JWT_SECRET ?? "supersecret-min-32-chars-required",
      cookieSecret: process.env.COOKIE_SECRET ?? "supersecret-cookie-min-32",
    },
  },
  admin: {
    vite: (config) => ({
      ...config,
      server: {
        host: "0.0.0.0",
        allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
        hmr: {
          port: 5173,
          clientPort: 5173,
        },
      },
    }),
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
