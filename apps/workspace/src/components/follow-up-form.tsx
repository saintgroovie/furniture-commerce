import { PendingForm } from "@/components/pending-form"

/** Quick follow-up. The server decides the Moscow date. */
export function FollowUpForm({
  action,
  back,
  entityType,
  entityId,
}: {
  action: string
  back: string
  entityType: "person" | "request" | "company" | "order"
  entityId: string
}) {
  return (
    <PendingForm action={action} className="stack">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <label className="field">
        <span>О чём напомнить</span>
        <input name="text" placeholder="Позвонить, уточнить размер" />
      </label>
      <div className="row">
        <button className="btn btn-secondary sm" type="submit" name="preset" value="today">Сегодня</button>
        <button className="btn btn-secondary sm" type="submit" name="preset" value="tomorrow">Завтра</button>
        <button className="btn btn-secondary sm" type="submit" name="preset" value="in_3_days">Через 3 дня</button>
        <button className="btn btn-secondary sm" type="submit" name="preset" value="in_7_days">Через неделю</button>
      </div>
      <label className="field">
        <span>Или дата</span>
        <input type="date" name="due_on" />
      </label>
      <button className="btn btn-ghost sm" type="submit" name="preset" value="date">Выбрать дату</button>
    </PendingForm>
  )
}
