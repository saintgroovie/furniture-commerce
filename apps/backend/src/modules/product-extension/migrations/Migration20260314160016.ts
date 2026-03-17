import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260314160016 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_classification" ("id" text not null, "product_type" text check ("product_type" in ('STANDARD', 'CONFIGURABLE', 'BESPOKE')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_classification_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_classification_deleted_at" ON "product_classification" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_classification" cascade;`);
  }

}
