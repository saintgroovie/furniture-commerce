/**
 * Minimal dependency-free RFC4180 CSV parser — read-only, in-memory only.
 * Mirrors the parser used by the local export toolkit
 * (`woodright-legacy-private-export/.../qa-and-candidate-pack.mjs`) so both
 * sides agree on quoting/escaping rules.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c === "\r") {
      // skip
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop()
  }

  const header = rows[0] ?? []
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])))
}
