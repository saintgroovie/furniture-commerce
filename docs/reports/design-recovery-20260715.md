# Design recovery 2026-07-15

## Base
- Branch: recovery/storefront-design-20260715
- Base SHA: a783e20 (feat/storefront-home-kids-landing HEAD)
- Why: newest safe functional storefront with material-tier pricing, gated PDP price, H→W→D, Fable PDP, premium landings

## Root cause
LaunchAgent com.woodright.storefront-qa serves :3002 from furniture-commerce-qa-runtime @ 6cc8ef0 (origin/main + catalog perf), which lacks feature-branch design/product stack.

## Packages restored from main dirty (uncommitted but required / approved polish)
See forensic audit: /Users/leonidmbp/Documents/woodright-recovery-audit/2026-07-15-054251/sources/recovery-packages.md

## Runtime candidate
http://127.0.0.1:3004 from this worktree

## Build
next build NEXT_DIST_DIR=.next-build-recovery PASS (with origin/main ignoreBuildErrors for QA boards)
