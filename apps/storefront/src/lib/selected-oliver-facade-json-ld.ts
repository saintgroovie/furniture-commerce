type Row = Record<string, unknown>

/** Client selection projects existing offers; it never calculates a new price. */
export function selectedOliverFacadeJsonLd(group: Row, variantId: string, materialCode: string | null): Row | null {
  if (!materialCode) return group
  const variants = group.hasVariant as Row[]
  const selected = variants.filter(v => {
    const query = new URL(String(v.url)).searchParams
    return query.get("variant") === variantId && query.get("material") === materialCode
  })
  if (selected.length !== 1) return null
  // Keep the complete family discoverable while the top-level Product represents
  // exactly the current buyer selection. Replace only its self-reference.
  return { ...selected[0], isVariantOf: { ...group, hasVariant: variants.map(v =>
    v === selected[0] ? { "@id": v["@id"] } : v) } }
}
