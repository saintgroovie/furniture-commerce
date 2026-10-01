import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Aligns a database that already applied Migration20261001180000
 * before mailbox was part of the message unique key.
 */
export class Migration20261001181000CommunicationMailbox extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'communication migration refused for database %', current_database();
        end if;
      end $$;
      alter table "woodright_comm_message" add column if not exists "mailbox" text;
      drop index if exists "IDX_woodright_comm_message_provider";
      create unique index if not exists "IDX_woodright_comm_message_mailbox"
        on "woodright_comm_message" ("provider", "mailbox", "provider_message_id")
        where deleted_at is null and mailbox is not null;
      create unique index if not exists "IDX_woodright_comm_message_rfc"
        on "woodright_comm_message" ("provider", "mailbox", "rfc_message_id")
        where deleted_at is null and rfc_message_id is not null and mailbox is not null;
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
      create unique index if not exists "IDX_woodright_comm_message_mailbox"
        on "woodright_comm_message" ("provider", "mailbox", "provider_message_id")
        where deleted_at is null and mailbox is not null;
      create unique index if not exists "IDX_woodright_comm_message_rfc"
        on "woodright_comm_message" ("provider", "mailbox", "rfc_message_id")
        where deleted_at is null and rfc_message_id is not null and mailbox is not null;
    `)
  }
}
