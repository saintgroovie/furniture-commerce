#!/usr/bin/env node
/**
 * Unique Woodright build execution identity helpers + fixture tests.
 * Format: build-<full-sha>-run-<run-id>-attempt-<attempt>
 */
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/

/**
 * `profile` is optional and only changes the prefix for
 * `build_profile=production_candidate` (namespace `build-production-candidate`,
 * see .github/workflows/build-staging-images.yml) so a production-candidate
 * build of a given SHA never collides with a public_demo build of the same
 * SHA. Omitting `profile` (or passing `public_demo`) keeps the original
 * `build-<sha>-run-<run-id>-attempt-<attempt>` format.
 */
function uniqueBuildTag({ sourceSha, runId, attempt, profile }) {
  if (!SHA_RE.test(sourceSha || "")) throw new Error("sourceSha must be 40-char hex")
  if (runId == null || String(runId).trim() === "") throw new Error("runId required")
  const att = Number(attempt)
  if (!Number.isInteger(att) || att < 1) throw new Error("attempt must be integer >= 1")
  const prefix = profile === "production_candidate" ? "build-prod-cand-" : "build-"
  return `${prefix}${sourceSha}-run-${runId}-attempt-${att}`
}

function assertDistinctExecutions(a, b) {
  const ta = uniqueBuildTag(a)
  const tb = uniqueBuildTag(b)
  if (ta === tb) throw new Error(`collision: ${ta}`)
  return { ta, tb }
}

function isAuthoritativeDeployRef(ref) {
  return typeof ref === "string" && ref.includes("@sha256:") && DIGEST_RE.test(ref.split("@").pop())
}

function main() {
  if (process.argv[2] === "--self-test") {
    let failed = 0
    const cases = []
    const t1 = uniqueBuildTag({
      sourceSha: "5683afa62890531f26b6e53b25800173c8efbb20",
      runId: "29830575969",
      attempt: 1,
    })
    const t2 = uniqueBuildTag({
      sourceSha: "5683afa62890531f26b6e53b25800173c8efbb20",
      runId: "29831078910",
      attempt: 1,
    })
    cases.push(["different run ids", t1 !== t2])
    const t3 = uniqueBuildTag({
      sourceSha: "5683afa62890531f26b6e53b25800173c8efbb20",
      runId: "29830575969",
      attempt: 2,
    })
    cases.push(["different attempts", t1 !== t3])
    cases.push([
      "same run backend/storefront share identity",
      t1 ===
        uniqueBuildTag({
          sourceSha: "5683afa62890531f26b6e53b25800173c8efbb20",
          runId: "29830575969",
          attempt: 1,
        }),
    ])
    cases.push(["sha-like not deployable", !isAuthoritativeDeployRef("img:5683afa62890531f26b6e53b25800173c8efbb20")])
    cases.push([
      "digest pinned ok",
      isAuthoritativeDeployRef(
        "ghcr.io/x/y@sha256:578bd815b104fbb44473b4dfc992e62d5e1041889be7fc3271cf9e582c1cabcf"
      ),
    ])
    try {
      assertDistinctExecutions(
        { sourceSha: "a".repeat(40), runId: "1", attempt: 1 },
        { sourceSha: "a".repeat(40), runId: "1", attempt: 1 }
      )
      cases.push(["collision detection", false])
    } catch {
      cases.push(["collision detection", true])
    }
    for (const [name, ok] of cases) {
      console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
      if (!ok) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (process.argv[2] === "--format") {
    console.log(
      uniqueBuildTag({
        sourceSha: process.argv[3],
        runId: process.argv[4],
        attempt: process.argv[5],
      })
    )
    return
  }
  console.error("usage: build-identity.cjs --self-test | --format <sha> <runId> <attempt>")
  process.exit(2)
}

if (require.main === module) main()

module.exports = { uniqueBuildTag, assertDistinctExecutions, isAuthoritativeDeployRef }
