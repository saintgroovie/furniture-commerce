type VitePlugin = {
  name: string
  transformIndexHtml?: {
    order?: "pre" | "post"
    handler: (html: string) => string
  }
}

const RELOAD_MARKER = "woodright-stale-chunk-reload"

/**
 * Один авто-reload при 404 на dynamic import / vite preload / static module script — без бесконечного цикла.
 *
 * !!! НЕ ДОБАВЛЯТЬ сброс/уменьшение счётчика по таймеру (`setTimeout`, "X секунд после load" и т.п.) !!!
 * Этот баг уже воспроизводился и чинился ДВАЖДЫ в этом проекте:
 *   1) счётчик сбрасывался через 4s после `load` → при повторных 404 chunk admin
 *      перезагружался снова и снова ("моргание админки").
 *   2) позже счётчик ошибочно вернули обратно как "сброс через 8s после стабильной
 *      load", решая другую, разовую проблему (стейл вкладка после ручной пересборки
 *      кэша) — это снова открыло бесконечный цикл, когда причина ошибки НЕ разовая,
 *      а повторяющаяся (например рестарт backend каждые ~30s ломает live Vite cache).
 * Бюджет reload — ЖЁСТКИЙ потолок на весь tab session (sessionStorage), без исключений.
 * Если бюджет исчерпан, а проблема не ушла — это сигнал чинить SERVER-side причину
 * (см. `medusa-config.ts` / backend HMR), а не давать клиенту больше попыток reload.
 *
 * Также ловим plain `error` событие на `<script type="module">` (entry.jsx статически
 * импортирует deps chunks — их 404 не всплывает как `vite:preloadError`/`unhandledrejection`,
 * а HMR выключен (`disable-hmr-plugin.ts`), поэтому Vite не может сам прислать full-reload
 * после починки deps — без этого слушателя страница виснет белым экраном навсегда.
 */
export function woodrightStaleChunkReloadPlugin(): VitePlugin {
  const snippet = `(function(){try{var k="woodright-vite-chunk-reload",m=2;function once(){var n=Number(sessionStorage.getItem(k)||"0");if(n>=m)return;sessionStorage.setItem(k,String(n+1));location.reload()}window.addEventListener("vite:preloadError",function(e){e.preventDefault();once()});window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason,t=r&&(r.message||String(r));if(t&&/Failed to fetch dynamically imported module|Importing a module script failed/i.test(t))once()});window.addEventListener("error",function(e){var t=e&&e.target;if(t&&t.tagName==="SCRIPT"&&t.type==="module")once();var msg=e&&e.message;if(msg&&/Failed to load module script|Unexpected token '<'/i.test(msg))once()},true);}catch(e){}})();`

  return {
    name: RELOAD_MARKER,
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (html.includes(RELOAD_MARKER)) {
          return html
        }
        return html.replace(
          "</body>",
          `<script data-${RELOAD_MARKER}>${snippet}</script></body>`,
        )
      },
    },
  }
}
