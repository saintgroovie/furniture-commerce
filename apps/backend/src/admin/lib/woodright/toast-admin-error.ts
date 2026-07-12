import { toast } from "@medusajs/ui"
import {
  normalizeAdminError,
  type NormalizeAdminErrorInput,
  type NormalizedAdminError,
} from "../errors/normalize-admin-error"

/**
 * Package F (F-05) — single error toast format for the Woodright admin:
 * operator title + explanation/action as the description.
 * Accepts either a raw failure (will be normalized) or an already
 * normalized error. Returns the normalized error for further handling.
 *
 * Not covered by node --test on purpose: imports @medusajs/ui runtime.
 */

function isNormalized(
  input: NormalizedAdminError | NormalizeAdminErrorInput
): input is NormalizedAdminError {
  return (
    typeof input === "object" &&
    input !== null &&
    "title" in input &&
    "technical" in input
  )
}

export function toastAdminError(
  input: NormalizedAdminError | NormalizeAdminErrorInput
): NormalizedAdminError {
  const err = isNormalized(input) ? input : normalizeAdminError(input)
  toast.error(err.title, { description: `${err.explanation} ${err.action}` })
  return err
}
