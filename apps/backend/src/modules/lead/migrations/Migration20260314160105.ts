import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260314160105 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "lead" ("id" text not null, "source" text check ("source" in ('bespoke', 'room_adapt', 'contact')) not null, "name" text null, "email" text null, "phone" text null, "comment" text null, "payload" jsonb null, "status" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "lead_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lead_deleted_at" ON "lead" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "lead" cascade;`);
  }

}
