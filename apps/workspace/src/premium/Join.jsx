import React, { useEffect, useState } from "react";
import { liveFetch } from "./storage.js";
import { workspacePath } from "../lib/paths.mjs";
import { Button, Field, FormError, Notice } from "./ui.jsx";
export function Join({ token }) {
  const [invite, setInvite] = useState(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setInvite(null);
    setError("");
    const controller = new AbortController();
    liveFetch("/api/live/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "inspect", token }),
      signal: controller.signal,
    })
      .then(setInvite)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  async function accept(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await liveFetch("/api/live/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "accept", token, name, password }),
      });
      setPassword("");
      window.location.hash = "/today";
      window.location.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="live-login">
      <aside>
        <a className="brand" href={workspacePath("/")}>
          <span className="brand-lockup">
            <img
              src={workspacePath("/brand/woodright-white.svg")}
              alt="Woodright"
            />
            <span className="brand-os">OS</span>
          </span>
        </a>
        <div>
          <span className="eyebrow">Команда Woodright</span>
          <h1>Ваше рабочее пространство.</h1>
        </div>
      </aside>
      <main>
        <div className="login-card">
          <h2>Присоединиться к команде</h2>
          {invite ? (
            <form className="form-stack" onSubmit={accept}>
              <Notice>Приглашение для {invite.email}</Notice>
              {invite.roleLabel && (
                <p className="muted">Рабочая роль: {invite.roleLabel}</p>
              )}
              {invite.accessExpiresAt && (
                <Notice>
                  Временный доступ до{" "}
                  {new Date(invite.accessExpiresAt).toLocaleString("ru-RU")}.
                </Notice>
              )}
              <Field label="Ваше имя">
                <input
                  autoComplete="name"
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Новый пароль">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={show}
                  onChange={(e) => setShow(e.target.checked)}
                />{" "}
                Показать пароль
              </label>
              <p className="muted small">
                Не менее 12 символов. Пароль известен только вам.
              </p>
              <FormError>{error}</FormError>
              <Button disabled={busy}>
                {busy ? "Создаём учётную запись…" : "Присоединиться"}
              </Button>
            </form>
          ) : (
            <>
              <p>Проверяем приглашение…</p>
              <FormError>{error}</FormError>
            </>
          )}
          <a className="inline-link" href={workspacePath("/#/today")}>
            Уже есть учётная запись? Войти
          </a>
        </div>
      </main>
    </div>
  );
}
