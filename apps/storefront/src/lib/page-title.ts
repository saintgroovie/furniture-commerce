import type { Metadata } from "next"

/**
 * The root layout appends « | Woodright» (Kids: « | Детская | Woodright»).
 * A page title that already names the brand is emitted as `absolute`, so the
 * tab and the search snippet never read «… Woodright | Woodright».
 */
export function pageTitle(title: string): NonNullable<Metadata["title"]> {
  return /woodright/iu.test(title) ? { absolute: title } : title
}

/**
 * UI leads are stored as sentence lines without trailing periods (UX rule).
 * Meta descriptions are ordinary prose: join the lines as sentences.
 */
export function joinMetaSentences(lines: readonly string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?…]$/u.test(l) ? l : `${l}.`))
    .join(" ")
}
