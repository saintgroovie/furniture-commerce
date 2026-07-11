type VitePlugin = {
  name: string
  enforce?: "post"
  config?: () => { server?: { hmr?: false } }
  configResolved?: (config: {
    server: { hmr?: false | Record<string, unknown> }
  }) => void
}

/**
 * Disable Admin Vite HMR by default.
 * Prevents React Fast Refresh double-injection failures that blank the dashboard
 * (`inWebWorker` / `prevRefreshReg` already declared).
 * Set ADMIN_VITE_HMR=1 to re-enable.
 */
export function woodrightDisableAdminHmrPlugin(): VitePlugin {
  if (process.env.ADMIN_VITE_HMR === "1") {
    return { name: "woodright-disable-admin-hmr-noop" }
  }

  return {
    name: "woodright-disable-admin-hmr",
    enforce: "post",
    config() {
      return { server: { hmr: false } }
    },
    configResolved(config) {
      config.server.hmr = false
    },
  }
}
