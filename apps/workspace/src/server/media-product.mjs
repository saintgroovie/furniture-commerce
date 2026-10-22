// Some staff can read the full seller catalog but not its single-product route.
// Both reads use the same actor token; a denied catalog list must remain denied.
export async function readMediaProduct(id, send) {
  try {
    return (
      (await send(`/admin/woodright/products/${encodeURIComponent(id)}`))
        .product || null
    );
  } catch (error) {
    if (error.status !== 403) throw error;
    const { products } = await send("/admin/woodright/products");
    if (!Array.isArray(products)) throw new Error("Invalid catalog response");
    return products.find((p) => p.id === id) || null;
  }
}
