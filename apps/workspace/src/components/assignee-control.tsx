import { PendingForm } from "@/components/pending-form"

export type StaffMember = { id: string; email: string | null }

export function findSelf(staff: StaffMember[], email: string | null | undefined): StaffMember | null {
  if (!email) return null
  const needle = email.trim().toLowerCase()
  return staff.find((member) => (member.email ?? "").trim().toLowerCase() === needle) ?? null
}

/**
 * Current assignee, change, «Назначить меня», unassign. Uses the existing
 * employee identity (Medusa users) - no second staff list.
 */
export function AssigneeControl({
  action,
  assigneeId,
  staff,
  selfEmail,
  allowUnassign = true,
}: {
  action: string
  assigneeId: string | null
  staff: StaffMember[]
  selfEmail: string | null
  allowUnassign?: boolean
}) {
  const current = staff.find((member) => member.id === assigneeId) ?? null
  const self = findSelf(staff, selfEmail)
  const isMe = Boolean(self && self.id === assigneeId)
  return (
    <div className="stack">
      <p>
        {current?.email || (assigneeId ? "Сотрудник назначен" : "Не назначен")}
        {isMe ? <span className="meta"> · это вы</span> : null}
      </p>
      {self && !isMe ? (
        <PendingForm action={action}>
          <input type="hidden" name="assignee_id" value={self.id} />
          <button className="btn btn-secondary sm" type="submit">Назначить меня</button>
        </PendingForm>
      ) : null}
      <PendingForm action={action} className="stack">
        <label className="field">
          <span>Изменить</span>
          <select name="assignee_id" defaultValue={assigneeId ?? ""}>
            {allowUnassign ? <option value="">Снять назначение</option> : null}
            {staff.map((member) => (
              <option key={member.id} value={member.id}>{member.email || member.id}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary sm" type="submit">Сохранить ответственного</button>
      </PendingForm>
    </div>
  )
}
