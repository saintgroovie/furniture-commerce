type VitePlugin = {
  name: string
  enforce?: "post"
  config?: () => { server?: { hmr?: false } }
  configResolved?: (config: { server: { hmr?: false | Record<string, unknown> } }) => void
}

/** Стабильный admin UI: без WebSocket HMR (reload loop / моргание). */
export function woodrightDisableAdminHmrPlugin(): VitePlugin {
  if (process.env.ADMIN_VITE_HMR === "1") {
    return { name: "woodright-disable-admin-hmr-noop" }
  }

  return {
    name: "woodright-disable-admin-hmr",
    enforce: "post",
    config() {
      return {
        server: {
          hmr: false,
        },
      }
    },
    configResolved(config) {
      config.server.hmr = false
    },
  }
}
