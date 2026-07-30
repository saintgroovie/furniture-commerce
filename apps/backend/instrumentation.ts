/**
 * Medusa loads this file early (`register`) when present at the backend root.
 * Ensures morgan `url` token redaction is installed before HTTP traffic.
 */
import { registerHttpAccessLogRedaction } from "./src/lib/http-access-log-redaction"

export function register(): void {
  registerHttpAccessLogRedaction()
}
