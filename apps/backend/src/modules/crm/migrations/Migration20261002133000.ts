import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Contact kinds on person notes. Refuses any database that is not workspace_it*. */
export class Migration20261002133000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'crm migration refused for database %', current_database();
        end if;
      end $$;
      alter table "woodright_person_note" add column if not exists "kind" text not null default 'note';
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if current_database() !~ '^workspace_it' then
          raise exception 'crm rollback refused for database %', current_database();
        end if;
      end $$;
      alter table "woodright_person_note" drop column if exists "kind";
    `)
  }
}
