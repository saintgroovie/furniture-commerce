import Link from "next/link"
import { pdpCopy } from "@/lib/woodright-copy"

type CompatibilityCard = { id: string; title: string }

/**
 * Renders the two directions of one backend relation.
 * Links only. Does not add a line.
 */
export function PdpCompatibility({
  accessories,
  compatibleWith,
}: {
  accessories: CompatibilityCard[]
  compatibleWith: CompatibilityCard[]
}) {
  if (accessories.length === 0 && compatibleWith.length === 0) return null
  return (
    <section className="pdp-compatibility">
      {accessories.length > 0 && (
        <div>
          <h2>{pdpCopy.fitsThisProduct}</h2>
          <ul>
            {accessories.map((item) => (
              <li key={item.id}>
                <Link href={`/product/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {compatibleWith.length > 0 && (
        <div>
          <h2>{pdpCopy.compatibleWith}</h2>
          <ul>
            {compatibleWith.map((item) => (
              <li key={item.id}>
                <Link href={`/product/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
