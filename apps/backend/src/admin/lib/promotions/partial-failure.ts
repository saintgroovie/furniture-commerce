/**
 * Package E — partial failure reporting for multi-step operations
 * (e.g. create promotion → attach campaign → activate; cart verification
 * chains). The operator must always learn which steps finished and which did
 * not — no silent "success" over half-completed work.
 */

export type OperationStepResult = {
  /** Stable machine id, e.g. "create_promotion". */
  step: string
  /** Russian label, e.g. «Создание акции». */
  label: string
  status: "ok" | "failed" | "skipped"
  /** Russian error text for failed steps. */
  error?: string
}

export type PartialFailureSummary = {
  verdict: "all_ok" | "partial" | "all_failed" | "nothing_ran"
  headline: string
  /** Line per step, ready for rendering. */
  lines: string[]
  /** Steps that failed (machine-readable for retry logic). */
  failed_steps: string[]
  /** Honest hint about the resulting state; null when everything is clean. */
  state_hint: string | null
}

export function summarizeOperationSteps(
  steps: OperationStepResult[],
  options?: { state_hint_on_partial?: string }
): PartialFailureSummary {
  const ran = steps.filter((s) => s.status !== "skipped")
  const okSteps = ran.filter((s) => s.status === "ok")
  const failedSteps = ran.filter((s) => s.status === "failed")

  const lines = steps.map((s) => {
    if (s.status === "ok") return `${s.label} - выполнено`
    if (s.status === "skipped") return `${s.label} - пропущено`
    return `${s.label} - ошибка${s.error ? `: ${s.error}` : ""}`
  })

  if (!ran.length) {
    return {
      verdict: "nothing_ran",
      headline: "Ни один шаг не выполнялся",
      lines,
      failed_steps: [],
      state_hint: null,
    }
  }
  if (!failedSteps.length) {
    return {
      verdict: "all_ok",
      headline: "Все шаги выполнены",
      lines,
      failed_steps: [],
      state_hint: null,
    }
  }
  if (!okSteps.length) {
    return {
      verdict: "all_failed",
      headline: "Операция не выполнена - изменений нет",
      lines,
      failed_steps: failedSteps.map((s) => s.step),
      state_hint: null,
    }
  }
  return {
    verdict: "partial",
    headline: `Выполнено шагов: ${okSteps.length} из ${ran.length} - операция завершена частично`,
    lines,
    failed_steps: failedSteps.map((s) => s.step),
    state_hint:
      options?.state_hint_on_partial ??
      "Часть изменений уже сохранена - проверьте акцию перед повторной попыткой",
  }
}
