import { describe, expect, it } from "vitest"
import { woodrightStaleChunkReloadPlugin } from "./stale-chunk-reload-plugin"

function extractSnippet(): string {
  const plugin = woodrightStaleChunkReloadPlugin()
  const html = plugin.transformIndexHtml!.handler("<body></body>")
  const match = html.match(/<script data-woodright-stale-chunk-reload>([\s\S]*?)<\/script>/)
  if (!match) throw new Error("snippet not found in transformed html")
  return match[1]!
}

/** Minimal browser-like sandbox to execute the inline recovery snippet. */
function runSnippetInSandbox(snippet: string, dispatch: (handlers: Record<string, Array<(e: unknown) => void>>) => void) {
  const handlers: Record<string, Array<(e: unknown) => void>> = {}
  const store: Record<string, string> = {}
  let reloaded = 0

  const sandbox = {
    sessionStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
    },
    window: {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        handlers[type] = handlers[type] ?? []
        handlers[type]!.push(fn)
      },
    },
    location: {
      reload: () => {
        reloaded++
      },
    },
  }

  const fn = new Function(
    "window",
    "sessionStorage",
    "location",
    `${snippet}`
  )
  fn(sandbox.window, sandbox.sessionStorage, sandbox.location)

  dispatch(handlers)
  return { reloaded, store }
}

describe("woodrightStaleChunkReloadPlugin snippet", () => {
  it("reloads once on plain module script error (static import 404)", () => {
    const snippet = extractSnippet()
    const { reloaded } = runSnippetInSandbox(snippet, (handlers) => {
      const errorHandlers = handlers["error"] ?? []
      for (const h of errorHandlers) {
        h({ target: { tagName: "SCRIPT", type: "module" } })
      }
    })
    expect(reloaded).toBe(1)
  })

  it("reloads on 'Failed to load module script' window error message", () => {
    const snippet = extractSnippet()
    const { reloaded } = runSnippetInSandbox(snippet, (handlers) => {
      const errorHandlers = handlers["error"] ?? []
      for (const h of errorHandlers) {
        h({ message: "Failed to load module script: foo" })
      }
    })
    expect(reloaded).toBe(1)
  })

  it("still reloads on vite:preloadError (dynamic import)", () => {
    const snippet = extractSnippet()
    const { reloaded } = runSnippetInSandbox(snippet, (handlers) => {
      const h = handlers["vite:preloadError"]?.[0]
      h?.({ preventDefault: () => {} })
    })
    expect(reloaded).toBe(1)
  })

  it("caps reloads at 2 within a session", () => {
    const snippet = extractSnippet()
    const handlersBox: Record<string, Array<(e: unknown) => void>> = {}
    const store: Record<string, string> = {}
    let reloaded = 0
    const fn = new Function(
      "window",
      "sessionStorage",
      "location",
      snippet
    )
    fn(
      {
        addEventListener: (type: string, h: (e: unknown) => void) => {
          handlersBox[type] = handlersBox[type] ?? []
          handlersBox[type]!.push(h)
        },
      },
      {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
      },
      { reload: () => reloaded++ }
    )
    const errorHandlers = handlersBox["error"] ?? []
    for (let i = 0; i < 5; i++) {
      for (const h of errorHandlers) h({ target: { tagName: "SCRIPT", type: "module" } })
    }
    expect(reloaded).toBe(2)
  })

  it("REGRESSION GUARD: never registers a 'load' listener (no time-based budget reset)", () => {
    // Этот баг чинили дважды: счётчик reload сбрасывался через таймер после `load`,
    // что превращало защиту от бесконечного цикла в его источник при ЛЮБОЙ повторяющейся
    // (не разовой) ошибке — например при флапающем backend HMR, ломающем Vite deps cache
    // на каждом рестарте. Бюджет reload должен быть ЖЁСТКИМ на весь tab session, без сброса.
    const snippet = extractSnippet()
    const handlers: Record<string, Array<(e: unknown) => void>> = {}
    const fn = new Function(
      "window",
      "sessionStorage",
      "location",
      snippet
    )
    fn(
      {
        addEventListener: (type: string, h: (e: unknown) => void) => {
          handlers[type] = handlers[type] ?? []
          handlers[type]!.push(h)
        },
      },
      { getItem: () => null, setItem: () => {} },
      { reload: () => {} }
    )
    expect(handlers["load"]).toBeUndefined()
    expect(snippet).not.toMatch(/setTimeout/)
  })

  it("does NOT grant a fresh budget after many error events over a long period (no reset)", () => {
    const snippet = extractSnippet()
    const handlersBox: Record<string, Array<(e: unknown) => void>> = {}
    const store: Record<string, string> = {}
    let reloaded = 0
    const fn = new Function("window", "sessionStorage", "location", snippet)
    fn(
      {
        addEventListener: (type: string, h: (e: unknown) => void) => {
          handlersBox[type] = handlersBox[type] ?? []
          handlersBox[type]!.push(h)
        },
      },
      {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
      },
      { reload: () => reloaded++ }
    )
    const errorHandlers = handlersBox["error"] ?? []
    // Симулирует флапающий backend (рестарт каждые ~30s ломает live Vite cache):
    // много повторяющихся ошибок растянуто во времени — бюджет не должен возвращаться.
    for (let batch = 0; batch < 20; batch++) {
      for (const h of errorHandlers) h({ target: { tagName: "SCRIPT", type: "module" } })
    }
    expect(reloaded).toBe(2)
    expect(store["woodright-vite-chunk-reload"]).toBe("2")
  })
})
