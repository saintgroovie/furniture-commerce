"use client"

/**
 * PDP import target. The committed KidsSectionProvider in this lineage has
 * no product-kids chrome API yet, so this is a mount-safe no-op.
 * `active` is reserved for a later chrome opt-in without changing the PDP contract.
 */
export function KidsProductSection({ active }: { active: boolean }) {
  void active
  return null
}
