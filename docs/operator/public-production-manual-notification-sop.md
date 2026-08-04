# Public production - temporary manual order monitoring SOP (template)

Version: `manual-notification-sop-v1`  
Environment: `public_production`  
Status: **template** - required for `TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH`

## Explicit absences (must remain honest)

While this workaround is active, the following are **not** automatic:

- customer order confirmation email
- sales new-order email
- Woodright password-reset email (Medusa Admin invite/reset is separate/private)
- delivery guarantees for fake outbox rows

Fake in-memory notifications are **not** a production provider.

## Queue

- Primary: Medusa Admin Orders + Woodright Производство (`stage=new`)
- Secondary: store leads / bespoke requests Admin APIs (no auto-notify)

## Roles

- Primary watcher: `________________`
- Backup watcher: `________________`

## Cadence

- Business hours (`Europe/Moscow`): every `____` minutes (max response target below)
- Off hours: `________________`

## Max response time

- New unpaid order contact buyer within: `____` minutes
- Missed SLA escalation within: `____` minutes

## Manual buyer confirmation

- Channel: `________________`
- Message must state: order received for manager confirmation; payment not completed online

## Journal

- Log processed order IDs (no PII in shared chat dumps): `________________`
- Daily missed-order check: `________________`

## Expiry

Owner must set `workaround_expires_at_utc` on the notification decision manifest.  
After expiry: launch remains blocked until provider decision or renewed workaround.

## Follow-up

Mandatory next cycle: choose and implement `SMTP_OR_NOTIFICATION_PROVIDER_REQUIRED_BEFORE_LAUNCH` readiness.
