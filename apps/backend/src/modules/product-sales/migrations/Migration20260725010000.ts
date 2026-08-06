import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Checked-in migration for product sales policy (Medusa custom module).
 * Apply locally via medusa db:migrate only - no production migrate in this cycle.
 */
export class Migration20260725010000ProductSalesPolicy extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "product_sales_policy" (
        "id" text not null,
        "sales_mode" text check (
          "sales_mode" in (
            'in_stock',
            'made_to_order',
            'configurable_to_order',
            'quote_required',
            'bespoke_project',
            'showroom_sample',
            'unavailable'
          )
        ) not null,
        "modifiers" jsonb null,
        "lead_time_text" text null,
        "buyer_message" text null,
        "manager_confirmation_required" boolean not null default false,
        "related_room_set_id" text null,
        "showroom_sample_available" boolean not null default false,
        "unavailable_reason" text null,
        "policy_source" text check (
          "policy_source" in ('override', 'unspecified')
        ) not null default 'override',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "product_sales_policy_pkey" primary key ("id")
      );
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "product_sales_policy" cascade;`)
  }
}
