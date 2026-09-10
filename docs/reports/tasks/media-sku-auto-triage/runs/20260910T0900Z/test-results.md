# Test results - 20260910T0900Z

| Gate | Result |
|------|--------|
| Production Medusa apply | not attempted (`unsafe_scope`) |
| Local `:9000` apply | not attempted |
| `yarn verify:media-gallery` | not run (no runtime gallery code change this run) |
| ol-84-1 hygiene | i2 not in rejectedIds; gallery_01 not in kept; i2 in gallery |
| Draft meta | `auto_triage_draft_not_operator_approved`, `do_not_auto_apply: true` |
| Board `:3144` | still LISTEN from prior durable start (not re-gated this file write) |
