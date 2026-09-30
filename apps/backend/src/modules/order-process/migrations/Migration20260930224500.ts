import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Desk audit is additive and refused outside workspace_it.
 * A missing table must not change commerce rows by itself.
 */
export class Migration20260930224500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin if current_database() !~ '^workspace_it' then raise exception 'desk-audit migration refused for database %', current_database(); end if; end $$;`)
    this.addSql(`create table if not exists "woodright_desk_audit" ("id" text not null, "actor_id" text null, "actor_email" text null, "entity_type" text not null, "entity_id" text not null, "action" text not null, "before_json" text null, "after_json" text null, "created_at" timestamptz not null default now(), constraint "woodright_desk_audit_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_woodright_desk_audit_entity" ON "woodright_desk_audit" ("entity_type", "entity_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`do $$ begin if current_database() !~ '^workspace_it' then raise exception 'desk-audit rollback refused for database %', current_database(); end if; end $$;`)
    this.addSql(`drop table if exists "woodright_desk_audit" cascade;`)
  }
}
