/**
 * First-screen catalog cards: decode before the route veil lifts.
 * Index 0 also gets fetchpriority=high (browser will demote extras).
 */
export const CATALOG_ATF_EAGER_COUNT = 8

export function catalogCardAtfFlags(index: number): {
  priorityHero: boolean
  atfHero: boolean
} {
  return {
    priorityHero: index === 0,
    atfHero: index > 0 && index < CATALOG_ATF_EAGER_COUNT,
  }
}
