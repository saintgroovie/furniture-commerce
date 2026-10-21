/** Verified rows of Розничный Прайс 18.09.2026.xlsx.
 * Source SHA-256: 55f37ab0a987e271e63f0784bfe2457a7b4e0bcbd4083745b93b07b2838d957c
 * Prices are exact cell values, not percentage estimates. The storefront and
 * backend copies are checked for equality by the catalog fidelity test.
 */
const PROVENCE: Record<string, { row: number; cream: number; wood: number }> = {
  "PV-05-2": {
    "row": 13,
    "cream": 66600,
    "wood": 69900
  },
  "PV-06-2": {
    "row": 32,
    "cream": 47300,
    "wood": 47900
  },
  "PV-08-2": {
    "row": 36,
    "cream": 23300,
    "wood": 24500
  },
  "PV-09-1": {
    "row": 11,
    "cream": 13600,
    "wood": 14300
  },
  "PV-55-1": {
    "row": 10,
    "cream": 19900,
    "wood": 18400
  },
  "PV-62-1": {
    "row": 25,
    "cream": 82100,
    "wood": 86300
  },
  "PV-61-1": {
    "row": 41,
    "cream": 122100,
    "wood": 128200
  },
  "PV-42-2": {
    "row": 35,
    "cream": 47800,
    "wood": 50300
  },
  "PV-65-8": {
    "row": 29,
    "cream": 83000,
    "wood": 87200
  }
}

export function provencePriceEvidence(key: string | null | undefined) {
  const sku = (key ?? "").replace(/^provence:/, "").toUpperCase()
  return PROVENCE[sku] ?? null
}

export function verifiedProvencePrices(key: string | null | undefined, base: number | null | undefined) {
  const entry = provencePriceEvidence(key)
  return entry && base === entry.cream ? entry : null
}

const DIMENSIONS: Record<string, { id: string; row_key: string; source_code: string; row: number; dimensions: Record<string, number> }> = {
  "av-05-1": {
    "id": "prod_01KV69A7AKTR1KH8GH90KC8YAJ",
    "row_key": "ВВ:21",
    "source_code": "WW-05-1",
    "row": 22,
    "dimensions": {
      "height_mm": 900.0,
      "width_mm": 840.0,
      "depth_mm": 440.0
    }
  },
  "ba-05-3": {
    "id": "prod_01KV69A7AKYY759QG6FC8CQ7JA",
    "row_key": "ВВ:19",
    "source_code": "WW-05-3",
    "row": 20,
    "dimensions": {
      "height_mm": 1370.0,
      "width_mm": 650.0,
      "depth_mm": 440.0
    }
  },
  "in-67-1": {
    "id": "prod_01KV69A7AMA4R5CX5YG8SPTE5B",
    "row_key": "ВВ:44",
    "source_code": "WW-67-1",
    "row": 45,
    "dimensions": {
      "height_mm": 780.0,
      "width_mm": 1300.0,
      "depth_mm": 720.0
    }
  },
  "fa-06-1": {
    "id": "prod_01KV69A7AMA53EWQH9MQK10H5K",
    "row_key": "ВВ:48",
    "source_code": "WW-06-1",
    "row": 49,
    "dimensions": {
      "height_mm": 1613.0,
      "width_mm": 1140.0,
      "depth_mm": 440.0
    }
  },
  "fk-05-1": {
    "id": "prod_01KV69A7AMAEGVHR09A7ZXH062",
    "row_key": "ВВ:21",
    "source_code": "WW-05-1",
    "row": 22,
    "dimensions": {
      "height_mm": 900.0,
      "width_mm": 840.0,
      "depth_mm": 440.0
    }
  },
  "rl-67-1": {
    "id": "prod_01KV69A7AMAN66BZ464F3B8W2P",
    "row_key": "ВВ:44",
    "source_code": "WW-67-1",
    "row": 45,
    "dimensions": {
      "height_mm": 780.0,
      "width_mm": 1300.0,
      "depth_mm": 720.0
    }
  },
  "fa-67-1": {
    "id": "prod_01KV69A7AMBRZPR11DCTPR7864",
    "row_key": "ВВ:44",
    "source_code": "WW-67-1",
    "row": 45,
    "dimensions": {
      "height_mm": 780.0,
      "width_mm": 1300.0,
      "depth_mm": 720.0
    }
  },
  "rl-05-3": {
    "id": "prod_01KV69A7AMQGCQMFGTXKY2VFPY",
    "row_key": "ВВ:19",
    "source_code": "WW-05-3",
    "row": 20,
    "dimensions": {
      "height_mm": 1370.0,
      "width_mm": 650.0,
      "depth_mm": 440.0
    }
  },
  "mo-81-1": {
    "id": "prod_01KV69A7AMTWYR1CTV1G1RFFBC",
    "row_key": "ВВ:47",
    "source_code": "WW-81-1",
    "row": 48,
    "dimensions": {
      "height_mm": 540.0,
      "width_mm": 600.0,
      "depth_mm": 440.0
    }
  },
  "pa-05-1": {
    "id": "prod_01KV69A7AMYW3Q4NJE3Q5WEFYR",
    "row_key": "ВВ:21",
    "source_code": "WW-05-1",
    "row": 22,
    "dimensions": {
      "height_mm": 900.0,
      "width_mm": 840.0,
      "depth_mm": 440.0
    }
  },
  "ba-62-1": {
    "id": "prod_01KV69A7AMZWW7MF8RG6A98292",
    "row_key": "ВВ:33",
    "source_code": "WW-62-1",
    "row": 34,
    "dimensions": {
      "height_mm": 1973.0,
      "width_mm": 940.0,
      "depth_mm": 440.0
    }
  },
  "te-05-3": {
    "id": "prod_01KV69A7ANA9Q0RM9FGCPM9KMQ",
    "row_key": "ВВ:19",
    "source_code": "WW-05-3",
    "row": 20,
    "dimensions": {
      "height_mm": 1370.0,
      "width_mm": 650.0,
      "depth_mm": 440.0
    }
  },
  "tb-67-1": {
    "id": "prod_01KV69A7ANKBFQ8BGHW8SQ5CTY",
    "row_key": "ВВ:44",
    "source_code": "WW-67-1",
    "row": 45,
    "dimensions": {
      "height_mm": 780.0,
      "width_mm": 1300.0,
      "depth_mm": 720.0
    }
  },
  "sh-81-1": {
    "id": "prod_01KV69A7ANP5VGMN2FSA70901M",
    "row_key": "ВВ:47",
    "source_code": "WW-81-1",
    "row": 48,
    "dimensions": {
      "height_mm": 540.0,
      "width_mm": 600.0,
      "depth_mm": 440.0
    }
  }
}

/** Only fill the exact previously verified corpus; never infer from SKU suffixes. */
export function verifiedMissingDimensions(product: Record<string, unknown>) {
  const entry = DIMENSIONS[String(product.handle ?? "")]
  const meta = product.metadata as Record<string, unknown> | undefined
  if (!entry || product.id !== entry.id || meta?.workbook_row_key !== entry.row_key ||
      meta.workbook_product_code !== entry.source_code || meta.dimensions || meta.dimensions_normalized) return null
  return entry.dimensions
}

const POSITIONS: Record<string, { id: string; row_key: string; original: Record<string, number>; axis: string; values: number[] }> = {
  "pv-06-2": {
    "id": "prod_01KNTBXADYD2QEG17C5CVDACD0",
    "row_key": "provence:PV-06-2",
    "original": {
      "depth_mm": 502,
      "width_mm": 1202,
      "height_mm": 750
    },
    "axis": "height",
    "values": [
      750,
      1150
    ]
  },
  "ox-90-1": {
    "id": "prod_01KQCSHV3ZJ5SB2ZYV4P6SJ2QR",
    "row_key": "oxford:OX-90-1",
    "original": {
      "depth_mm": 1392,
      "width_mm": 2605,
      "height_mm": 1930
    },
    "axis": "depth",
    "values": [
      1392,
      1700
    ]
  },
  "ol-21-1": {
    "id": "prod_01KNTBXADJNM2C7N1WJDACRGR2",
    "row_key": "oliver:OL-21-1",
    "original": {
      "depth_mm": 1000,
      "width_mm": 1940,
      "height_mm": 780
    },
    "axis": "width",
    "values": [
      1940,
      2440
    ]
  }
}

/** Preserve the two printed values; they are not one scalar or a continuous range. */
export function verifiedPositionDimensions(product: Record<string, unknown>) {
  const entry = POSITIONS[String(product.handle ?? "")]
  const meta = product.metadata as Record<string, unknown> | undefined
  const normalized = meta?.dimensions_normalized as Record<string, unknown> | undefined
  const primary = meta?.dimensions as Record<string, unknown> | undefined
  if (!entry || product.id !== entry.id || meta?.workbook_row_key !== entry.row_key ||
      !normalized || normalized.axis_states || primary?.axis_states ||
      Object.entries(entry.original).some(([key,value]) => normalized[key] !== value) ||
      Object.entries(primary ?? {}).some(([key,value]) => entry.original[key] !== value)) return null
  const result: Record<string, unknown> = { ...entry.original }
  delete result[`${entry.axis}_mm`]
  result.axis_states = [{ axis: entry.axis, values_mm: entry.values }]
  return result
}
