import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Catalog Promotion Window presentation slot (Woodright custom module).
 * Additive: one table, no changes to Medusa core tables.
 * Discount amounts live in native price lists - not here.
 */
export class Migration20260908120000PromotionSlot extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "promotion_slot" (
        "id" text not null,
        "key" text not null,
        "enabled" boolean not null default false,
        "label" text null,
        "product_ids" jsonb not null default '[]'::jsonb,
        "starts_at" timestamptz null,
        "ends_at" timestamptz null,
        "rotation_interval_ms" integer not null default 7000,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "promotion_slot_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_promotion_slot_key_unique"
        on "promotion_slot" ("key")
        where "deleted_at" is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "promotion_slot" cascade;`)
  }
}
