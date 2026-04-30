# Oxford-4 Pilot Interim Asset Source Map

Pass type: controlled interim source mapping for pilot static materialization only.

## Scope

- Pilot subset only:
  - `OX-14-11`
  - `OX-90-1`
  - `OX-14-1`
  - `S-OX-05`
- Source policy alignment:
  - `source_type = non_white`
  - `confidence = confirmed`
  - `white_background_source = false`

## Purpose

- Allow `oxford-pilot-four:materialize-static` to resolve approved interim pilot sources without assuming full white-background lane coverage.
- Keep Oxford paused and avoid any rollout interpretation.

## Mapping rules

- Primary preferred source path:
  - existing interim static pilot file (if already present locally).
- Fallback source path:
  - known Oxford PDF extract source under `data/raw/pdf-assets/extracted/Oxford_full/`.
- Target path:
  - `apps/backend/static/products/oxford/{handle}_interim_pdf_gallery_01.png`

## Non-readiness guardrail

- `approved_for_interim_pilot_static_materialization` is not:
  - media-ready,
  - storefront-ready,
  - rollout-ready.

## Machine-readable artifact

- `data/normalized/oxford-four-pilot-interim-asset-source-map.json`
