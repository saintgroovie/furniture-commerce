"use client"

import { createContext, useContext, type ReactNode } from "react"

const CspNonceContext = createContext<string | undefined>(undefined)

/** Pass middleware CSP nonce into client components that emit inline <script>. */
export function CspNonceProvider({
  nonce,
  children,
}: {
  nonce?: string
  children: ReactNode
}) {
  return (
    <CspNonceContext.Provider value={nonce}>{children}</CspNonceContext.Provider>
  )
}

export function useCspNonce(): string | undefined {
  return useContext(CspNonceContext)
}
