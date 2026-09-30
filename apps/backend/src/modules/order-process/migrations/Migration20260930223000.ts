import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Order assignee is a side table so a missing migration cannot break
 * existing order-process reads. Apply only on workspace_it.
 */
export class Migration20260930223000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin if current_database() !~ '^workspace_it' then raise exception 'order-assignment migration refused for database %', current_database(); end if; end $$;`)
    this.addSql(`create table if not exists "woodright_order_assignment" ("order_id" text not null, "assignee_id" text null, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "woodright_order_assignment_pkey" primary key ("order_id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_woodright_order_assignment_deleted_at" ON "woodright_order_assignment" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`do $$ begin if current_database() !~ '^workspace_it' then raise exception 'order-assignment rollback refused for database %', current_database(); end if; end $$;`)
    this.addSql(`drop table if exists "woodright_order_assignment" cascade;`)
  }
}
