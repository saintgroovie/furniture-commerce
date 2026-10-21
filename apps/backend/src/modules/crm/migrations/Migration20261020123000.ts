import { Migration } from "@medusajs/framework/mikro-orm/migrations";
import { MANGO_SCHEMA } from "../../../lib/woodright-desk/mango-schema";
export class Migration20261020123000 extends Migration {
  async up(): Promise<void> {
    this.addSql(MANGO_SCHEMA);
  }
  async down(): Promise<void> {
    throw new Error(
      "Telephony history requires a reviewed retention/restore procedure",
    );
  }
}
