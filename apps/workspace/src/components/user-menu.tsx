"use client"

import { Avatar } from "@/components/object-row"

/** Session actions live in a menu. Logout is not a second navigation row. */
export function UserMenu({ email, escapeHref }: { email: string; escapeHref: string | null }) {
  const name = email.split("@")[0] || email
  return (
    <details className="user-menu">
      <summary>
        <Avatar name={email} size="sm" />
        <span className="sidebar-user-text">
          <span title={email}>{name}</span>
          <span className="meta">{email}</span>
        </span>
      </summary>
      <div className="user-menu-panel">
        {escapeHref ? <a href={escapeHref}>Техническая админка</a> : null}
        <form action="/api/session" method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit">Выйти</button>
        </form>
      </div>
    </details>
  )
}
