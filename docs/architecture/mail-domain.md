# Communication domain (no live mailbox)

Yandex stays the mailbox. Woodright stores an index: thread, message metadata,
attachment metadata, sync checkpoint, connection status. Message bodies and
attachment blobs are not stored. There is no token column.

`mailConnectorEnabled()` stays false. `decideInbox` is visible only when a
connection row is `configured`, the actor has `mail.view`, and the live
connector is enabled. A workspace env flag cannot open Входящие. `/inbox` always asks the
backend and leaves unless that answer is visible. The section is not in navigation.

Mail capabilities are off for every admin, including owners, unless the email
is listed in `WOODRIGHT_WORKSPACE_MAIL_EMAILS`.

Incoming exact From address may attach a thread to one existing person.
Several candidates stay `needs_review`. An unknown sender becomes a contact
lead later, never a Medusa customer. Internal notes and external replies are
different routes (`/api/people/:id/notes` versus a future mail reply route).

Project id on a thread is nullable. There is still no Project entity.
