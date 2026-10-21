import { Migration } from "@medusajs/framework/mikro-orm/migrations";
import { TEAM_SCHEMA } from "../../../lib/woodright-desk/team-schema";
export class Migration20261021120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(TEAM_SCHEMA);
  }
  async down(): Promise<void> {
    throw new Error(
      "Company and assignment data require a reviewed forward repair",
    );
  }
}
