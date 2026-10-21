import React, { useState } from "react";
import { Button, Field, FormError, Section } from "./ui.jsx";
import { liveFetch } from "./storage.js";
export function PasswordChange() {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (next !== confirm) throw new Error("Новые пароли не совпадают.");
      await liveFetch("/api/live/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      window.location.hash = "/today";
      window.location.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Личный пароль">
      <p className="muted">
        Укажите текущий пароль и задайте новый, не короче 12 символов. После
        сохранения войдите заново.
      </p>
      <form className="form-stack" onSubmit={submit}>
        {[
          ["Текущий пароль", current, setCurrent, "current-password"],
          ["Новый пароль", next, setNext, "new-password"],
          ["Повторите новый пароль", confirm, setConfirm, "new-password"],
        ].map(([label, value, setValue, auto]) => (
          <Field key={label} label={label}>
            <input
              type={show ? "text" : "password"}
              autoComplete={auto}
              required
              minLength={auto === "new-password" ? 12 : 1}
              maxLength={1024}
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        ))}
        <label>
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />{" "}
          Показать пароли
        </label>
        <FormError>{error}</FormError>
        <Button disabled={busy}>
          {busy ? "Сохраняем…" : "Изменить пароль"}
        </Button>
      </form>
    </Section>
  );
}
