import type { ReactNode } from "react"
import { HomeRevealObserver } from "@/components/home/home-reveal-observer"

type EditorialTheme = "about" | "production" | "materials" | "designers" | "partners" | "legal"

export function EditorialShell({
  theme,
  children,
}: {
  theme: EditorialTheme
  children: ReactNode
}) {
  return (
    <div className={`ed ed--${theme}`}>
      <HomeRevealObserver />
      {children}
    </div>
  )
}
