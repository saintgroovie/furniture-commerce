/**
 * Finish key that may be sent to the cart for this SKU.
 * A key left over from the previous variant is replaced by this SKU's first finish.
 * Null stays null so the caller can apply its own default.
 */
export function offeredExecutionKey(
  activeKey: string | null,
  offered: ReadonlyArray<{ key: string }> | null | undefined
): string | null {
  if (!activeKey || !offered?.length) return activeKey
  return offered.some((item) => item.key === activeKey) ? activeKey : offered[0].key
}
