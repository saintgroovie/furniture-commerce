import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Communication index. Refuses any database that is not workspace_it*. Stores no message body. */
export class Migration20261001180000Communication extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'communication migration refused for database %', current_database();
        end if;
      end $$;
      create table if not exists "woodright_comm_thread" (
        "id" text not null,
        "channel" text not null default 'email',
        "mailbox" text null,
        "subject" text null,
        "status" text not null default 'open',
        "waiting_on" text not null default 'us',
        "assignee_id" text null,
        "lead_id" text null,
        "company_id" text null,
        "request_id" text null,
        "order_id" text null,
        "project_id" text null,
        "last_message_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_comm_thread_pkey" primary key ("id")
      );
      create table if not exists "woodright_comm_message" (
        "id" text not null,
        "thread_id" text not null,
        "provider" text not null,
        "mailbox" text not null,
        "provider_message_id" text not null,
        "direction" text not null,
        "sender" text null,
        "recipients_json" text null,
        "occurred_at" timestamptz not null,
        "folder" text null,
        "uid" text null,
        "uid_validity" text null,
        "rfc_message_id" text null,
        "in_reply_to" text null,
        "references_json" text null,
        "content_state" text not null default 'metadata_only',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_comm_message_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_comm_message_mailbox"
        on "woodright_comm_message" ("provider", "mailbox", "provider_message_id")
        where deleted_at is null;
      create unique index if not exists "IDX_woodright_comm_message_rfc"
        on "woodright_comm_message" ("provider", "mailbox", "rfc_message_id")
        where deleted_at is null and rfc_message_id is not null;
      create table if not exists "woodright_comm_attachment" (
        "id" text not null,
        "message_id" text not null,
        "filename" text null,
        "mime" text null,
        "size" integer null,
        "provider_ref" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_comm_attachment_pkey" primary key ("id")
      );
      create table if not exists "woodright_mail_checkpoint" (
        "id" text not null,
        "mailbox" text not null,
        "folder" text not null,
        "uid_validity" text not null,
        "last_uid" integer not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_mail_checkpoint_pkey" primary key ("id")
      );
      create unique index if not exists "IDX_woodright_mail_checkpoint_folder"
        on "woodright_mail_checkpoint" ("mailbox", "folder")
        where deleted_at is null;
      create table if not exists "woodright_mail_connection" (
        "id" text not null,
        "provider" text not null default 'yandex',
        "mailbox" text not null,
        "status" text not null default 'disabled',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "woodright_mail_connection_pkey" primary key ("id")
      );
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'communication rollback refused for database %', current_database();
        end if;
      end $$;
      drop table if exists "woodright_mail_connection" cascade;
      drop table if exists "woodright_mail_checkpoint" cascade;
      drop table if exists "woodright_comm_attachment" cascade;
      drop table if exists "woodright_comm_message" cascade;
      drop table if exists "woodright_comm_thread" cascade;
    `)
  }
}
