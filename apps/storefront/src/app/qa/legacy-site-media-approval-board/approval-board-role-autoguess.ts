import type { ChecklistItem, OperatorRole } from "./approval-board-types"

export type RoleAutoguessConfidence = "high" | "medium" | "low"

export type RoleAutoguess = {
  auto_role_guess: OperatorRole
  auto_role_confidence: RoleAutoguessConfidence
  auto_role_reason: string
}

const SCHEME_RE = /scheme|sketch|drawing|черт|схем|blueprint|technical/i
const INTERIOR_RE = /interior|room|lifestyle|интерьер|комнат|обстанов/i

/** Learned from operator export legacy-site-media-triage-2026-05-27.json (58 items). */
export function guessOperatorRole(
  item: Pick<ChecklistItem, "filename" | "role_guess" | "url" | "source_page">
): RoleAutoguess {
  const fn = (item.filename || "").toLowerCase()
  const url = `${item.url || ""} ${item.source_page || ""}`.toLowerCase()
  const legacy = normalizeLegacyRoleGuess(item.role_guess)

  if (SCHEME_RE.test(fn) || SCHEME_RE.test(url)) {
    return { auto_role_guess: "scheme", auto_role_confidence: "high", auto_role_reason: "scheme/drawing keyword" }
  }
  if (INTERIOR_RE.test(fn) || INTERIOR_RE.test(url)) {
    return { auto_role_guess: "interior", auto_role_confidence: "medium", auto_role_reason: "interior/lifestyle keyword" }
  }

  if (/-i1\.(png|jpe?g|webp)$/i.test(item.filename || "")) {
    return {
      auto_role_guess: "front_3_4",
      auto_role_confidence: "high",
      auto_role_reason: "filename -i1 (operator pattern: 4/4 → 3/4)",
    }
  }
  if (/-i2\.(png|jpe?g|webp)$/i.test(item.filename || "")) {
    return {
      auto_role_guess: "front",
      auto_role_confidence: "high",
      auto_role_reason: "filename -i2 (operator pattern: 3/3 → front)",
    }
  }

  if (/-iso-1/i.test(fn)) {
    return {
      auto_role_guess: "front",
      auto_role_confidence: "medium",
      auto_role_reason: "filename -iso-1 (operator majority → front; not detail)",
    }
  }
  if (/-iso-2/i.test(fn)) {
    return {
      auto_role_guess: "front",
      auto_role_confidence: "low",
      auto_role_reason: "filename -iso-2 (operator mixed; default front)",
    }
  }
  if (/-iso[-_.]/i.test(fn) || /-iso\.(jpe?g|png|webp)$/i.test(fn)) {
    return {
      auto_role_guess: "front_3_4",
      auto_role_confidence: "medium",
      auto_role_reason: "filename -iso base (operator majority → 3/4; legacy often wrongly detail)",
    }
  }

  if (/\b3-4\b|\b34\b|angle|angled|perspective/i.test(fn)) {
    return {
      auto_role_guess: "front_3_4",
      auto_role_confidence: "medium",
      auto_role_reason: "filename angle/3-4 hint",
    }
  }
  if (/\bfront\b|main\b|face/i.test(fn) && !/detail/i.test(fn)) {
    return {
      auto_role_guess: "front",
      auto_role_confidence: "medium",
      auto_role_reason: "filename front/main hint",
    }
  }
  if (/\bside\b|profile/i.test(fn)) {
    return {
      auto_role_guess: "side",
      auto_role_confidence: "medium",
      auto_role_reason: "filename side hint",
    }
  }

  if (legacy === "front_3_4") {
    return {
      auto_role_guess: "front_3_4",
      auto_role_confidence: "high",
      auto_role_reason: "legacy role_guess 3/4",
    }
  }
  if (legacy === "front") {
    return {
      auto_role_guess: "front",
      auto_role_confidence: "high",
      auto_role_reason: "legacy role_guess front",
    }
  }

  if (legacy === "detail" && /iso/i.test(fn)) {
    return {
      auto_role_guess: "front_3_4",
      auto_role_confidence: "low",
      auto_role_reason: "legacy detail + iso — likely full product, not crop (fallback 3/4)",
    }
  }

  if (legacy && legacy !== "unknown") {
    return {
      auto_role_guess: legacy,
      auto_role_confidence: "low",
      auto_role_reason: `legacy role_guess ${item.role_guess}`,
    }
  }

  return {
    auto_role_guess: "unknown",
    auto_role_confidence: "low",
    auto_role_reason: "no strong filename or legacy signal",
  }
}

export function normalizeLegacyRoleGuess(roleGuess: string | undefined): OperatorRole | null {
  if (!roleGuess || roleGuess === "unknown") return null
  if (roleGuess === "3/4") return "front_3_4"
  if (roleGuess === "front") return "front"
  if (roleGuess === "side") return "side"
  if (roleGuess === "detail") return "detail"
  if (roleGuess === "interior") return "interior"
  if (roleGuess === "scheme") return "scheme"
  return null
}

export function autoguessLabel(confidence: RoleAutoguessConfidence): string {
  if (confidence === "high") return "высокая"
  if (confidence === "medium") return "средняя"
  return "низкая"
}
