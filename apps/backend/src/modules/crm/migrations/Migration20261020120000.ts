import { Migration } from "@medusajs/framework/mikro-orm/migrations";

import { DESK_SCHEMA } from "../../../lib/woodright-desk/schema";

/** Test-only promotion gate mirrors the existing CRM owner branch. No production migration in this PR. */
export class Migration20261020120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(DESK_SCHEMA);
  }
  async down(): Promise<void> {
    throw new Error(
      "Desk history rollback requires a reviewed forward fix or database restore",
    );
  }
}
