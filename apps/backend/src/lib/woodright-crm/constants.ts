export const PERSON_ROLES = [
  "buyer",
  "designer",
  "architect",
  "company_representative",
  "partner",
] as const

export type PersonRole = (typeof PERSON_ROLES)[number]

export const PERSON_ROLE_LABEL: Record<PersonRole, string> = {
  buyer: "Покупатель",
  designer: "Дизайнер",
  architect: "Архитектор",
  company_representative: "Представитель компании",
  partner: "Партнёр",
}

export const COMPANY_TYPES = [
  "design_studio",
  "architecture_bureau",
  "partner",
  "other",
] as const

export type CompanyType = (typeof COMPANY_TYPES)[number]

export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  design_studio: "Дизайн-студия",
  architecture_bureau: "Архитектурное бюро",
  partner: "Партнёр",
  other: "Другое",
}

export const FOLLOW_UP_ENTITIES = ["person", "request", "company", "order"] as const
export type FollowUpEntity = (typeof FOLLOW_UP_ENTITIES)[number]

export const FOLLOW_UP_STATUSES = ["open", "done", "cancelled"] as const
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

export function isPersonRole(value: string): value is PersonRole {
  return (PERSON_ROLES as readonly string[]).includes(value)
}

export function isCompanyType(value: string): value is CompanyType {
  return (COMPANY_TYPES as readonly string[]).includes(value)
}

export function isFollowUpEntity(value: string): value is FollowUpEntity {
  return (FOLLOW_UP_ENTITIES as readonly string[]).includes(value)
}

export function isFollowUpStatus(value: string): value is FollowUpStatus {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(value)
}
