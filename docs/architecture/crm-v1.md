# CRM v1 - Person stays the Lead

Decision: **option A**. The employee-facing Person is the existing `lead` row.
Medusa Customer stays the commerce customer. Woodright stores only the relationship
and workflow context around that lead.

## Why not B or C

- B (a new Person table plus a migration that copies leads) duplicates name, email, and phone and needs a backfill.
- C (a read-only projection) cannot persist roles, company membership, follow-ups, or notes.

Option A adds tables next to `lead` and does not copy orders or customers.

## What is stored where

| Fact | Owner |
|---|---|
| Name, email, phone, intake comment | `lead` |
| Commerce customer, orders, payments | Medusa |
| Optional customer link and assignee | `woodright_person_link` |
| Roles (buyer, designer, architect, company representative, partner) | `woodright_person_role` |
| Company and person↔company | `woodright_company`, `woodright_person_company` |
| Follow-up | `woodright_follow_up` |
| Internal person notes (append-only) | `woodright_person_note` |
| Request ↔ existing order id | `woodright_request_order` |
| Request ↔ company / second person | `bespoke_request.company_id`, `counterparty_lead_id` |

One person can hold several roles. A designer is a role, not a second customer.

## Identity

Unchanged: exact normalized email, exact normalized phone, or an explicit manual link.
Several candidates stay `needs_review`. No auto-merge. A partial phone is not a unique match.

## Project

No current case of one project owning several orders was found (`project_id` is absent;
`bespoke_project` is a product sales mode). Project stays future design. Orders are not copied.

## Follow-up and Сегодня

An open follow-up whose Moscow calendar date is today or earlier is added to the existing
desk inbox as kind `follow_up`. Catalog and order blockers are unchanged.

## Activity

`projectActivity` reads notes, follow-ups, requests, orders, company names, desk-audit
action codes, and manufacturing event types. It does not write a global activity table.
Audit snapshots keep ids and statuses. Note text, phone, and email are not written there.

## Migration

`Migration20261001163000` refuses any database whose name does not start with `workspace_it`.
Apply only through the isolated workspace migrate path. Do not apply to the daily or production database.
