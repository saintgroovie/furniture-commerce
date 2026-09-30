import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Additive person-link table. Do not apply to production or the daily QA
 * database until the owner gate in docs/architecture/workspace.md.
 */
export class Migration20260930180000PersonLink extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'person-link migration refused for database %', current_database();
        end if;
      end $$;
      create table if not exists "woodright_person_link" (
        "id" text not null,
        "lead_id" text not null,
        "customer_id" text null,
        "assignee_id" text null,
        "match_status" text not null default 'unlinked',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_person_link_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_person_link_lead_id"
        on "woodright_person_link" ("lead_id")
        where deleted_at is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'person-link rollback refused for database %', current_database();
        end if;
      end $$;
      drop table if exists "woodright_person_link" cascade;
    `)
  }
}
