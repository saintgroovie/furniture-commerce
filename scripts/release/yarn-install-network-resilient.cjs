#!/usr/bin/env node
/**
 * CI-only: run `yarn install --immutable` with bounded install-level retries
 * for explicitly classified transient registry/network failures.
 *
 * Does not retry lockfile / integrity / auth / package-not-found / unknown.
 * Does not wrap tests. Preserves final install exit code.
 *
 *   node scripts/release/yarn-install-network-resilient.cjs --cwd <dir>
 *
 * Env:
 *   WOODRIGHT_INSTALL_MAX_ATTEMPTS   default 3
 *   WOODRIGHT_INSTALL_MAX_SLEEP_SEC  default 300
 *   WOODRIGHT_INSTALL_MAX_CUMULATIVE_SLEEP_SEC  default 600
 *   WOODRIGHT_INSTALL_BASE_SLEEP_SEC default 30
 *   WOODRIGHT_INSTALL_SLEEP_MS_OVERRIDE  if set (tests), sleep that many ms instead
 *   WOODRIGHT_INSTALL_COMMAND  default "yarn install --immutable" (tests only)
 */
"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const DEFAULTS = {
  maxAttempts: 3,
  maxSleepSec: 300,
  maxCumulativeSleepSec: 600,
  baseSleepSec: 30,
}

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])
const NON_RETRYABLE_HTTP = new Set([400, 401, 403, 404, 405, 410, 422])

/**
 * Strip ANSI CSI/SGR (and common OSC) sequences from diagnostic text before
 * classification. Yarn Berry colors "Response Code: 429" so naive regex misses
 * the status when escapes sit between the label and digits.
 *
 * Keeps package names, Yarn codes (YN0035), URLs, and HTTP status digits.
 */
function stripAnsi(text) {
  if (!text) return ""
  return String(text)
    // CSI: ESC [ ... command letter (includes SGR m, and other CSI)
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    // OSC: ESC ] ... BEL or ST
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    // stray single ESC
    .replace(/\u001b/g, "")
}

function redact(text) {
  if (!text) return ""
  return String(text)
    .replace(/\b(ghp_|github_pat_|npm_)[A-Za-z0-9_]+\b/g, "$1[REDACTED]")
    .replace(/\/\/[^/@\s]+:[^@\s]+@/g, "//[REDACTED]@")
    .replace(/(_authToken=)[^\s&]+/gi, "$1[REDACTED]")
}

function parseArgs(argv) {
  const out = { cwd: process.cwd(), help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--cwd" && argv[i + 1]) {
      out.cwd = path.resolve(argv[++i])
    } else if (a === "--help" || a === "-h") {
      out.help = true
    }
  }
  return out
}

function envInt(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw === "") return fallback
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

/**
 * Extract Retry-After as safe integer seconds only.
 * Rejects HTTP-date forms and malformed values.
 */
function parseRetryAfterSeconds(text, maxSleepSec) {
  const m = stripAnsi(text).match(/Retry-After:\s*(\d+)\b/i)
  if (!m) return null
  const sec = Number.parseInt(m[1], 10)
  if (!Number.isFinite(sec) || sec < 0) return null
  return Math.min(sec, maxSleepSec)
}

function extractHttpStatuses(text) {
  const normalized = stripAnsi(text)
  const statuses = []
  const re =
    /(?:HTTP(?:\/\d\.\d)?\s+|status(?:\s+code)?\s*[:=]?\s*|Response\s+Code:\s*|YN0035[^\n]*?\b)(\d{3})\b/gi
  let m
  while ((m = re.exec(normalized))) {
    statuses.push(Number.parseInt(m[1], 10))
  }
  // Yarn often prints: "Response Code: 429 (Too Many Requests)"
  const re2 = /Response Code:\s*(\d{3})/gi
  while ((m = re2.exec(normalized))) {
    statuses.push(Number.parseInt(m[1], 10))
  }
  // Phrase form after ANSI strip (label may be absent)
  if (/\b429\s*\(?\s*Too Many Requests\)?/i.test(normalized)) {
    statuses.push(429)
  }
  return statuses
}

function hasNetworkCode(text, code) {
  return new RegExp(`\\b${code}\\b`).test(stripAnsi(text))
}

/**
 * Classify install output. Fail-fast classes win over retryable.
 * YN0035 alone is NOT retryable without HTTP/network evidence.
 * ANSI is stripped once before matching so colored Yarn Berry logs classify.
 */
function classifyInstallFailure(combined) {
  const text = stripAnsi(combined || "")

  // Non-retryable: lockfile / immutable
  if (
    /YN0028|The lockfile would have been modified|lockfile.*immutable|immutable.*lockfile/i.test(
      text
    )
  ) {
    return { retryable: false, reason: "immutable_lockfile" }
  }

  // Non-retryable: integrity / checksum
  if (
    /checksum|integrity\s+check|YN0018|hash mismatch|EINTEGRITY/i.test(text)
  ) {
    return { retryable: false, reason: "integrity_mismatch" }
  }

  // Non-retryable: auth
  if (
    /\b401\b|\b403\b|unauthorized|forbidden|authentication|YN0033|missing.*token/i.test(
      text
    ) &&
    !/\b429\b/.test(text)
  ) {
    // Prefer explicit status list below; this is a belt-and-suspenders auth catch
    const statuses = extractHttpStatuses(text)
    if (statuses.some((s) => s === 401 || s === 403) || /YN0033|unauthorized|forbidden/i.test(text)) {
      return { retryable: false, reason: "auth_failure" }
    }
  }

  const statuses = extractHttpStatuses(text)
  if (statuses.some((s) => NON_RETRYABLE_HTTP.has(s))) {
    const s = statuses.find((x) => NON_RETRYABLE_HTTP.has(x))
    if (s === 401 || s === 403) return { retryable: false, reason: "auth_failure" }
    if (s === 404) return { retryable: false, reason: "package_not_found" }
    return { retryable: false, reason: `http_${s}_non_retryable` }
  }

  // Package / manifest not found without ambiguous 429
  if (
    /package not found|not found in the registry|YN0035[^\n]*404|Manifest not found/i.test(
      text
    ) &&
    !statuses.some((s) => RETRYABLE_HTTP.has(s))
  ) {
    return { retryable: false, reason: "package_not_found" }
  }

  // Config / unsupported
  if (/unsupported (node|yarn)|invalid registry|YN0002|YN0046/i.test(text)) {
    return { retryable: false, reason: "config_error" }
  }

  // Postinstall / build script (not network install fetch)
  if (/ELIFECYCLE|postinstall.*failed|Failed with exit code/i.test(text) && !statuses.length) {
    // Only if no retryable HTTP evidence
    if (!hasNetworkCode(text, "ECONNRESET") && !hasNetworkCode(text, "ETIMEDOUT")) {
      return { retryable: false, reason: "script_or_lifecycle" }
    }
  }

  // Retryable HTTP
  if (statuses.some((s) => RETRYABLE_HTTP.has(s))) {
    const s = statuses.find((x) => RETRYABLE_HTTP.has(x))
    return { retryable: true, reason: `http_${s}`, httpStatus: s }
  }

  // Retryable network codes
  for (const code of ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "ENOTFOUND"]) {
    // ENOTFOUND alone can be permanent DNS; only EAI_AGAIN/ECONNRESET/ETIMEDOUT are preferred.
    // Allow ECONNREFUSED as transient runner/network blip; ENOTFOUND without EAI_AGAIN → non-retryable.
  }
  if (hasNetworkCode(text, "ECONNRESET")) {
    return { retryable: true, reason: "ECONNRESET" }
  }
  if (hasNetworkCode(text, "ETIMEDOUT") || /socket hang up|network timeout/i.test(text)) {
    return { retryable: true, reason: "ETIMEDOUT" }
  }
  if (hasNetworkCode(text, "EAI_AGAIN")) {
    return { retryable: true, reason: "EAI_AGAIN" }
  }

  // YN0035 without HTTP/network evidence → not retryable
  if (/YN0035/.test(text)) {
    return { retryable: false, reason: "YN0035_without_retryable_http_evidence" }
  }

  return { retryable: false, reason: "unknown_failure" }
}

function computeBackoffSeconds({
  attemptIndex,
  combinedOutput,
  maxSleepSec,
  baseSleepSec,
  remainingCumulativeSec,
}) {
  const fromHeader = parseRetryAfterSeconds(combinedOutput, maxSleepSec)
  let sec
  if (fromHeader != null) {
    sec = fromHeader
  } else {
    // attemptIndex is 1-based for the attempt that just failed
    sec = Math.min(maxSleepSec, baseSleepSec * 2 ** (attemptIndex - 1))
  }
  sec = Math.min(sec, maxSleepSec, remainingCumulativeSec)
  return Math.max(0, sec)
}

function sleepSeconds(sec) {
  const overrideMs = process.env.WOODRIGHT_INSTALL_SLEEP_MS_OVERRIDE
  if (overrideMs != null && overrideMs !== "") {
    const ms = Number.parseInt(overrideMs, 10)
    if (Number.isFinite(ms) && ms >= 0) {
      spawnSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`], {
        stdio: "ignore",
      })
      return
    }
  }
  if (sec <= 0) return
  // Bounded sleep via node; avoid shell injection from headers (sec is numeric).
  const ms = Math.floor(sec * 1000)
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`], {
    stdio: "ignore",
  })
}

function runInstallOnce(cwd, command) {
  const parts = command.trim().split(/\s+/)
  const bin = parts[0]
  const args = parts.slice(1)
  const res = spawnSync(bin, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  })
  const stdout = res.stdout || ""
  const stderr = res.stderr || ""
  const combined = `${stdout}\n${stderr}`
  const status = typeof res.status === "number" ? res.status : 1
  return { status, stdout, stderr, combined, error: res.error }
}

function logLine(obj) {
  const safe = { ...obj }
  if (safe.excerpt) safe.excerpt = redact(safe.excerpt).slice(0, 500)
  console.log(`[woodright-install-resilient] ${JSON.stringify(safe)}`)
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(
      "Usage: node yarn-install-network-resilient.cjs --cwd <dir>\nRuns: yarn install --immutable with bounded network-only retries."
    )
    return 0
  }

  const cwd = args.cwd
  if (!fs.existsSync(cwd)) {
    console.error(`cwd does not exist: ${cwd}`)
    return 2
  }

  const maxAttempts = Math.max(1, envInt("WOODRIGHT_INSTALL_MAX_ATTEMPTS", DEFAULTS.maxAttempts))
  const maxSleepSec = envInt("WOODRIGHT_INSTALL_MAX_SLEEP_SEC", DEFAULTS.maxSleepSec)
  const maxCumulative = envInt(
    "WOODRIGHT_INSTALL_MAX_CUMULATIVE_SLEEP_SEC",
    DEFAULTS.maxCumulativeSleepSec
  )
  const baseSleepSec = envInt("WOODRIGHT_INSTALL_BASE_SLEEP_SEC", DEFAULTS.baseSleepSec)
  const command = process.env.WOODRIGHT_INSTALL_COMMAND || "yarn install --immutable"
  const allowTestCommand = process.env.WOODRIGHT_INSTALL_ALLOW_TEST_COMMAND === "1"

  if (
    !allowTestCommand &&
    (!/\byarn\b/.test(command) || !/--immutable\b/.test(command))
  ) {
    console.error("refusing: WOODRIGHT_INSTALL_COMMAND must include yarn and --immutable")
    return 2
  }

  let cumulativeSleep = 0
  let lastStatus = 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logLine({ event: "attempt_start", attempt, maxAttempts, cwd, command })
    const result = runInstallOnce(cwd, command)
    lastStatus = result.status

    if (result.error) {
      logLine({
        event: "spawn_error",
        attempt,
        message: redact(result.error.message || String(result.error)),
      })
      return typeof result.error.code === "number" ? result.error.code : 1
    }

    if (result.status === 0) {
      logLine({ event: "success", attempt, exit: 0 })
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      return 0
    }

    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)

    const classification = classifyInstallFailure(result.combined)
    logLine({
      event: "attempt_failed",
      attempt,
      exit: result.status,
      classification,
      excerpt: result.combined.slice(-800),
    })

    if (!classification.retryable) {
      logLine({ event: "fail_fast", reason: classification.reason, exit: result.status })
      return result.status || 1
    }

    if (attempt >= maxAttempts) {
      logLine({
        event: "retries_exhausted",
        attempts: maxAttempts,
        exit: result.status,
        reason: classification.reason,
      })
      return result.status || 1
    }

    const remaining = Math.max(0, maxCumulative - cumulativeSleep)
    if (remaining <= 0) {
      logLine({ event: "cumulative_backoff_exhausted", exit: result.status })
      return result.status || 1
    }

    const sleepSec = computeBackoffSeconds({
      attemptIndex: attempt,
      combinedOutput: result.combined,
      maxSleepSec,
      baseSleepSec,
      remainingCumulativeSec: remaining,
    })

    logLine({
      event: "backoff",
      sleep_sec: sleepSec,
      cumulative_sleep_sec: cumulativeSleep + sleepSec,
      reason: classification.reason,
    })
    sleepSeconds(sleepSec)
    cumulativeSleep += sleepSec
  }

  return lastStatus || 1
}

module.exports = {
  classifyInstallFailure,
  computeBackoffSeconds,
  parseRetryAfterSeconds,
  redact,
  stripAnsi,
  extractHttpStatuses,
  DEFAULTS,
  main,
  runInstallOnce,
}

if (require.main === module) {
  process.exitCode = main()
}
