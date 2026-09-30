import { previewAllowed } from "@/lib/runtime-boundary"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error =
    params.error === "auth"
      ? "Не удалось войти"
      : params.error === "config"
        ? "Сервер Medusa не настроен"
        : null
  return (
    <main className="login">
      <form className="card" action="/api/session" method="post">
        <h1 className="page-title">Стол</h1>
        <p className="page-lead">Вход для сотрудников Woodright</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label>
          Почта
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="primary" type="submit">Войти</button>
      </form>
      {previewAllowed() ? (
        <form action="/api/session" method="post">
          <input type="hidden" name="intent" value="preview" />
          <button className="ghost" type="submit">Открыть пример</button>
        </form>
      ) : null}
    </main>
  )
}
