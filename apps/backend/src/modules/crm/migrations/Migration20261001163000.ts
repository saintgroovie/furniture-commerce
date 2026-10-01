import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * CRM context next to Lead. Refuses any database whose name is not workspace_it*.
 * Does not copy Medusa customers or orders.
 */
export class Migration20261001163000Crm extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'crm migration refused for database %', current_database();
        end if;
      end $$;
      create table if not exists "woodright_company" (
        "id" text not null,
        "name" text not null,
        "type" text null,
        "internal_note" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_company_pkey" primary key ("id")
      );
      create table if not exists "woodright_person_company" (
        "id" text not null,
        "lead_id" text not null,
        "company_id" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_person_company_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_person_company_pair"
        on "woodright_person_company" ("lead_id", "company_id")
        where deleted_at is null;
      create table if not exists "woodright_person_role" (
        "id" text not null,
        "lead_id" text not null,
        "role" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_person_role_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_person_role_pair"
        on "woodright_person_role" ("lead_id", "role")
        where deleted_at is null;
      create table if not exists "woodright_follow_up" (
        "id" text not null,
        "entity_type" text not null,
        "entity_id" text not null,
        "assignee_id" text null,
        "due_at" timestamptz not null,
        "summary" text not null,
        "status" text not null default 'open',
        "created_by" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_follow_up_pkey" primary key ("id")
      );
      create index if not exists "IDX_woodright_follow_up_entity"
        on "woodright_follow_up" ("entity_type", "entity_id")
        where deleted_at is null;
      create table if not exists "woodright_person_note" (
        "id" text not null,
        "lead_id" text not null,
        "body" text not null,
        "created_by" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_person_note_pkey" primary key ("id")
      );
      create index if not exists "IDX_woodright_person_note_lead"
        on "woodright_person_note" ("lead_id")
        where deleted_at is null;
      create table if not exists "woodright_request_order" (
        "id" text not null,
        "request_id" text not null,
        "order_id" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_request_order_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_request_order_pair"
        on "woodright_request_order" ("request_id", "order_id")
        where deleted_at is null;
      alter table "bespoke_request" add column if not exists "company_id" text null;
      alter table "bespoke_request" add column if not exists "counterparty_lead_id" text null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'crm rollback refused for database %', current_database();
        end if;
      end $$;
      alter table "bespoke_request" drop column if exists "counterparty_lead_id";
      alter table "bespoke_request" drop column if exists "company_id";
      drop table if exists "woodright_request_order" cascade;
      drop table if exists "woodright_person_note" cascade;
      drop table if exists "woodright_follow_up" cascade;
      drop table if exists "woodright_person_role" cascade;
      drop table if exists "woodright_person_company" cascade;
      drop table if exists "woodright_company" cascade;
    `)
  }
}
