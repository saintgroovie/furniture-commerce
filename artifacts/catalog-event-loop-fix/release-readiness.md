# Release readiness

Not ready for production cutover.

- Branch: `fix/catalog-event-loop-blocking`
- Base: live `424f637937e46f377b0b46c50cfa9b41cee3ff5e`
- Old candidate `a0ae70be1bff2468304e4ca9dfcffd3738d4fde1` is not an ancestor of this branch and is not included. It stays a separate lineage (bed size, partners viewer, isolated bake).
- No new images, no new digests, no approval seal, no recovery point.
- Isolated production-scale benchmark and full semantic catalog diff were not run.
- Live production was not restarted and was not given this code.
