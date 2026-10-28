import Link from "next/link"
import { nativeFamilyChoiceRows, qualifiedNativeFamily } from "@/lib/qualified-native-family"

/** Each link opens its own original native product and variant, so every
 * size / footboard change also receives that SKU's real capabilities. */
export function PdpNativeFamilySelectors({ product, members }: {
  product: Record<string, unknown>
  members: Record<string, unknown>[]
}) {
  const fixed = Object.entries(qualifiedNativeFamily(product)?.family.fixedProperties ?? {}).filter(([label]) => label !== "Раздел")
  return <>
  {nativeFamilyChoiceRows(product, members).map(row => (
    <div key={row.label} className="pdp-size-selector" role="group" aria-label={row.label}>
      <span className="pdp-option-heading">
        <span className="pdp-option-heading-label">{row.label}</span>
        <span className="pdp-option-heading-sep" aria-hidden="true">{" - "}</span>
        <span className="pdp-option-heading-value">{row.choices.find(choice => choice.isCurrent)?.label}</span>
      </span>
      <div className="pdp-size-chip-row">
        {row.choices.map(choice => choice.isCurrent
          ? <span key={choice.id} className="pdp-size-chip is-active" aria-current="true"><span className="pdp-size-chip-label">{choice.label}</span></span>
          : <Link key={choice.id} prefetch={false} href={choice.href} className="pdp-size-chip"><span className="pdp-size-chip-label">{choice.label}</span></Link>)}
      </div>
    </div>
  ))}
  {fixed.length > 0 && <dl className="pdp-family-fixed-properties">
    {fixed.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>}
  </>
}
