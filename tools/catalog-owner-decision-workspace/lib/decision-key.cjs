#!/usr/bin/env node

/** Stable decision key: product + bucket + field (category_gap vs title_fallback must not collide). */
function decisionKey(productId, bucket, field) {
  if (!productId || !bucket || !field) {
    throw new Error("decision_key_requires_product_bucket_field")
  }
  return `${productId}::${bucket}::${field}`
}

function parseDecisionKey(key) {
  const parts = String(key).split("::")
  if (parts.length !== 3) return null
  return { product_id: parts[0], bucket: parts[1], field: parts[2] }
}

module.exports = { decisionKey, parseDecisionKey }
