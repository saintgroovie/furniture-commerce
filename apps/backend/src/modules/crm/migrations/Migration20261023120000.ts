import { Migration } from "@medusajs/framework/mikro-orm/migrations";
import { INVOICE_SCHEMA } from "../../../lib/woodright-desk/invoice-schema";
export class Migration20261023120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(INVOICE_SCHEMA);
  }
  async down(): Promise<void> {
    throw new Error(
      "Saved invoices and file permissions require reviewed forward repair",
    );
  }
}
