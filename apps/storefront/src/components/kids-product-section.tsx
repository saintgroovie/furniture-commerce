"use client"

import { useKidsProductSection } from "@/lib/use-kids-section"

/**
 * Opts shared header/footer into kids chrome while a kids PDP is mounted.
 * Renders nothing — side effect only.
 */
export function KidsProductSection({ active }: { active: boolean }) {
  useKidsProductSection(active)
  return null
}
