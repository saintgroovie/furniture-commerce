/**
 * Server-confirmed feedback. Rendered only from the redirect query the API
 * route produced after the backend answered - never from client state.
 */
export function ResultToast({
  saved,
  error,
  storefront,
  savedLabel = "Сохранено",
}: {
  saved?: string
  error?: string
  storefront?: string
  savedLabel?: string
}) {
  if (error) {
    return (
      <p className="toast warn" role="alert">
        {error}
      </p>
    )
  }
  if (saved !== "1") return null
  if (storefront === "match") {
    return (
      <p className="toast" role="status">
        ✓ {savedLabel}. Витрина показывает то же
      </p>
    )
  }
  if (storefront === "miss") {
    return (
      <p className="toast waiting" role="status">
        ◐ Данные сохранены. Витрина ещё не обновилась
      </p>
    )
  }
  if (storefront === "skipped") {
    return (
      <p className="toast" role="status">
        ✓ {savedLabel}. Проверка витрины не запускалась
      </p>
    )
  }
  return (
    <p className="toast" role="status">
      ✓ {savedLabel}
    </p>
  )
}
