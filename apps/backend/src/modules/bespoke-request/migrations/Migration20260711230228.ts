import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260711230228 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bespoke_request" ("id" text not null, "lead_id" text not null, "product_id" text null, "room_set_id" text null, "dimensions" text null, "materials" text null, "budget" text null, "comment" text null, "status" text check ("status" in ('new', 'contacted', 'quote_sent', 'paid', 'in_production', 'completed')) not null default 'new', "internal_notes" text null, "quoted_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bespoke_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bespoke_request_deleted_at" ON "bespoke_request" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bespoke_request" cascade;`);
  }

}
