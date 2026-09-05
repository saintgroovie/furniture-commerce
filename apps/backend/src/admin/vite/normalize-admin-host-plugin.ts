type VitePlugin = {
  name: string
  transformIndexHtml?: {
    order?: "pre" | "post"
    handler: (html: string) => string
  }
}

const HOST_MARKER = "woodright-admin-normalize-host"

/**
 * Medusa Admin embeds `__BACKEND_URL__` from MEDUSA_BACKEND_URL.
 * When that is `http://localhost:9000` but the operator opens
 * `http://127.0.0.1:9000/app`, auth hits another host → cookies/CORS break
 * and login looks like a blank / stuck admin.
 *
 * Redirect loopback IP → localhost before the SPA boots.
 */
export function woodrightAdminNormalizeHostPlugin(): VitePlugin {
  const snippet = `(function(){try{if(location.hostname!=="127.0.0.1")return;var u=new URL(location.href);u.hostname="localhost";location.replace(u.toString());}catch(e){}})();`

  return {
    name: HOST_MARKER,
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes(HOST_MARKER)) {
          return html
        }
        return html.replace(
          "<head>",
          `<head><script data-${HOST_MARKER}>${snippet}</script>`,
        )
      },
    },
  }
}
