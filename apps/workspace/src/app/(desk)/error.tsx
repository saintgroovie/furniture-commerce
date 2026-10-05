"use client"

export default function DeskError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h1 className="page-title">Страница не открылась</h1>
      <p className="error" role="alert">Данные не загрузились</p>
      <button className="btn btn-primary" type="button" onClick={() => reset()}>
        Повторить
      </button>
    </div>
  )
}
