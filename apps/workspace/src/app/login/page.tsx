import { previewAllowed } from "@/lib/runtime-boundary"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error =
    params.error === "auth"
      ? "Не удалось войти. Проверьте почту и пароль"
      : params.error === "config"
        ? "Сервер Medusa не настроен"
        : null
  return (
    <main className="login">
      <form className="card" action="/api/session" method="post">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">Стол</span>
          <span className="brand-sub">WOODRIGHT</span>
        </div>
        <p className="page-lead">Вход для сотрудников Woodright</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label className="field">
          <span>Почта</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary full" type="submit">Войти</button>
        {previewAllowed() ? (
          <button className="btn btn-ghost full" type="submit" name="intent" value="preview" formNoValidate>
            Открыть пример данных
          </button>
        ) : null}
      </form>
    </main>
  )
}
