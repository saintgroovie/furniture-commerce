# Woodright Production Publication Review — owner UI assets

Versioned **UI-only** package for the local Production Publication Review owner console
(`Проверка перед публикацией`).

## Contents

- `app/` — HTML/CSS/JS served to the owner
- `lib/ux-helpers.cjs` — pure helpers (sale labels, correction summary, gallery indices)
- `tests/run-unit-tests.cjs` — Node unit tests

Runtime HTTP server / daemon and decision persistence live in the operator
publication-review workspace (not in this package). Point that server’s static
root at these `app/` assets.

## UX invariants

- Card corrections collapsed by default (`Предлагаемые исправления`)
- Technical fields only in disclosure
- Sale/availability uses human labels (no owner-facing `effective` / `default`)
- Per-card gallery: arrows, counter, thumbnails, keyboard, swipe, fullscreen
- Gallery interactions must not mutate owner decisions

## Tests

```bash
node tools/production-publication-review/owner-review-app/tests/run-unit-tests.cjs
```
