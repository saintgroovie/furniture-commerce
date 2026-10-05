import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Accessory compatibility links. Additive table. Does not change Medusa core.
 * One row is the only source for both PDP directions.
 */
export class Migration20261005120000ProductCompatibility extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "product_compatibility" (
        "id" text not null,
        "accessory_product_id" text not null,
        "product_id" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "product_compatibility_pkey" primary key ("id"),
        constraint "product_compatibility_not_self"
          check ("accessory_product_id" <> "product_id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_product_compatibility_pair_unique"
        on "product_compatibility" ("accessory_product_id", "product_id")
        where "deleted_at" is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "product_compatibility" cascade;`)
  }
}
