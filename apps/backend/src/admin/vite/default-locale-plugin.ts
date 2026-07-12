type VitePlugin = {
  name: string
  transformIndexHtml?: {
    order?: "pre" | "post"
    handler: (html: string) => string
  }
}

const LOCALE_MARKER = "woodright-admin-default-locale"

/**
 * Sets Admin default locale only when the operator has no saved `lng`
 * (cookie/localStorage). Never overwrite an explicit language choice.
 */
export function woodrightAdminDefaultLocalePlugin(): VitePlugin {
  const defaultLocale = process.env.ADMIN_DEFAULT_LOCALE ?? "ru"
  const snippet = `(function(){try{var l=${JSON.stringify(defaultLocale)};if(localStorage.getItem("lng"))return;var m=document.cookie.match(/(?:^|;\\s*)lng=([^;]+)/);if(m&&decodeURIComponent(m[1]))return;localStorage.setItem("lng",l);document.cookie="lng="+encodeURIComponent(l)+";path=/;max-age=31536000;SameSite=Lax";}catch(e){}})();`

  return {
    name: LOCALE_MARKER,
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes(LOCALE_MARKER)) {
          return html
        }
        return html.replace(
          "<head>",
          `<head><script data-${LOCALE_MARKER}>${snippet}</script>`,
        )
      },
    },
  }
}
