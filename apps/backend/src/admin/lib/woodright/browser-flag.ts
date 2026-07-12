import { isWoodrightAdminUxV1Enabled } from "../feature-flags/woodright-admin-flags.ts"

/**
 * Package F (F-02) — single browser-side reader for WOODRIGHT_ADMIN_UX_V1.
 * Replaces the per-file `readFlagFromBrowser` copies in routes and widgets.
 *
 * Priority: window override → localStorage → build-time import.meta.env.
 * First present source wins, even if it disables the flag ("0" on window
 * must not fall through to an enabling localStorage value).
 */

export type WoodrightFlagSources = {
  windowValue?: string | null
  localStorageValue?: string | null
  envValue?: string | null
}

/** Pure resolver — unit-testable without a DOM. */
export function resolveWoodrightAdminUxFlag(sources: WoodrightFlagSources): boolean {
  for (const value of [sources.windowValue, sources.localStorageValue, sources.envValue]) {
    if (value != null) {
      return isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: String(value) })
    }
  }
  return false
}

export function readWoodrightAdminUxFlagFromBrowser(): boolean {
  let windowValue: string | null = null
  let localStorageValue: string | null = null
  let envValue: string | null = null

  try {
    const w = window as unknown as { __WOODRIGHT_ADMIN_UX_V1__?: string }
    if (w.__WOODRIGHT_ADMIN_UX_V1__ != null) {
      windowValue = String(w.__WOODRIGHT_ADMIN_UX_V1__)
    }
  } catch {
    /* not in a browser */
  }
  try {
    localStorageValue = window.localStorage.getItem("WOODRIGHT_ADMIN_UX_V1")
  } catch {
    /* storage unavailable */
  }
  try {
    // Vite only statically replaces *direct* property access. Assigning
    // `import.meta` to a temp variable leaves env values undefined in the bundle.
    const raw = import.meta.env.WOODRIGHT_ADMIN_UX_V1
    if (raw != null && String(raw) !== "") {
      envValue = String(raw)
    }
  } catch {
    /* no import.meta.env */
  }

  return resolveWoodrightAdminUxFlag({ windowValue, localStorageValue, envValue })
}
