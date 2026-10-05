"use client"

import { useState } from "react"

/** Password input with a show/hide control. The posted field name stays `password`. */
export function PasswordField() {
  const [shown, setShown] = useState(false)
  const label = shown ? "Скрыть" : "Показать"
  return (
    <label className="field">
      <span>Пароль</span>
      <span className="password-field">
        <input name="password" type={shown ? "text" : "password"} autoComplete="current-password" required />
        <button
          className="text-button"
          type="button"
          aria-pressed={shown}
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setShown((value) => !value)}
        >
          {label}
        </button>
      </span>
    </label>
  )
}
