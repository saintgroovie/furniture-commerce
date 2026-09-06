import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260725010100OrderProcess extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "woodright_order_process" (
        "id" text not null,
        "order_id" text not null,
        "current_stage" text not null default 'new',
        "previous_stage" text null,
        "estimated_completion_date" timestamptz null,
        "customer_message" text null,
        "internal_note" text null,
        "paused_reason" text null,
        "version" integer not null default 1,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_order_process_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_order_process_order_id"
        on "woodright_order_process" ("order_id")
        where deleted_at is null;
    `)

    this.addSql(`
      create table if not exists "woodright_order_process_event" (
        "id" text not null,
        "process_id" text not null,
        "order_id" text not null,
        "previous_stage" text null,
        "next_stage" text not null,
        "event_type" text not null,
        "actor_type" text not null,
        "actor_id" text null,
        "actor_display" text null,
        "customer_visible" boolean not null default true,
        "customer_message" text null,
        "internal_note" text null,
        "notification_requested" boolean not null default false,
        "notification_result" text null,
        "source" text not null,
        "idempotency_key" text null,
        "correlation_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_order_process_event_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_order_process_event_idempotency"
        on "woodright_order_process_event" ("idempotency_key")
        where idempotency_key is not null and deleted_at is null;
    `)

    this.addSql(`
      create table if not exists "woodright_order_access" (
        "id" text not null,
        "order_id" text not null,
        "token_hash" text not null,
        "cart_id_hash" text null,
        "expires_at" timestamptz not null,
        "revoked_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_order_access_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_order_access_order_id"
        on "woodright_order_access" ("order_id")
        where deleted_at is null;
    `)

    this.addSql(`
      create table if not exists "woodright_notification_delivery" (
        "id" text not null,
        "event_id" text not null,
        "channel" text not null,
        "recipient_key" text not null,
        "status" text not null default 'pending',
        "attempt_count" integer not null default 0,
        "last_error" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_notification_delivery_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_notification_delivery_unique"
        on "woodright_notification_delivery" ("event_id", "channel", "recipient_key")
        where deleted_at is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "woodright_notification_delivery" cascade;`)
    this.addSql(`drop table if exists "woodright_order_access" cascade;`)
    this.addSql(`drop table if exists "woodright_order_process_event" cascade;`)
    this.addSql(`drop table if exists "woodright_order_process" cascade;`)
  }
}
