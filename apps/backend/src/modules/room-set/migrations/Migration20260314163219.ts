import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260314163219 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "room_set" drop constraint if exists "room_set_slug_unique";`);
    this.addSql(`create table if not exists "room_set" ("id" text not null, "title" text not null, "slug" text not null, "description" text null, "hero_image" text null, "gallery" jsonb null, "price_from" integer null, "room_type" text null, "style" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "room_set_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_room_set_slug_unique" ON "room_set" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_room_set_deleted_at" ON "room_set" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "room_set_item" ("id" text not null, "room_set_id" text not null, "quantity" integer not null default 1, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "room_set_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_room_set_item_deleted_at" ON "room_set_item" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "room_set" cascade;`);

    this.addSql(`drop table if exists "room_set_item" cascade;`);
  }

}
