"use client"

import type { OrphanP0OverlayMissingArtifact } from "./orphan-p0-overlay-missing-types"

export function OrphanP0OverlayMissingPanel({ missing }: { missing: OrphanP0OverlayMissingArtifact }) {
  return (
    <aside
      style={{
        borderRight: "1px solid #ddd",
        background: "#fff8f0",
        padding: "16px 14px",
        overflowY: "auto",
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#7a3b00", marginBottom: "8px" }}>
        Overlay artifact missing
      </div>
      <p style={{ fontSize: "12px", color: "#5a4200", lineHeight: 1.5, margin: "0 0 12px" }}>
        Run the Orphan P0 overlay build step. No routing is available until the artifact exists on disk.
      </p>
      <div
        style={{
          fontSize: "11px",
          background: "#fff",
          border: "1px solid #e6c200",
          borderRadius: "6px",
          padding: "10px",
          marginBottom: "12px",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "6px" }}>Rebuild command</div>
        <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {missing.rebuild_instructions}
        </code>
      </div>
      <div style={{ fontSize: "11px", color: "#666", lineHeight: 1.45 }}>
        <div>
          <strong>Expected path:</strong>
        </div>
        <code style={{ wordBreak: "break-all" }}>{missing.expected_path}</code>
        <div style={{ marginTop: "8px" }}>
          <strong>Repo root:</strong> {missing.repo_root}
        </div>
        <div style={{ marginTop: "8px" }}>
          <strong>Source chain:</strong>
        </div>
        <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
          {missing.source_chain.map((line) => (
            <li key={line}>
              <code style={{ fontSize: "10px" }}>{line}</code>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: "10px", fontWeight: 600, color: "#7a3b00" }}>
          do_not_auto_apply: true
        </div>
      </div>
    </aside>
  )
}
