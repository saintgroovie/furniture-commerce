import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260314160203 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "payment_link" ("id" text not null, "entity_type" text check ("entity_type" in ('order', 'lead')) not null, "entity_id" text not null, "amount" integer not null, "currency_code" text not null, "url" text not null, "purpose" text null, "status" text check ("status" in ('created', 'sent', 'paid', 'expired')) not null default 'created', "expires_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_link_deleted_at" ON "payment_link" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_link" cascade;`);
  }

}
