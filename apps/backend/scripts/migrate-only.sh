#!/bin/sh
set -eu
# Prefer compiled JS entry via medusa CLI binary — no yarn/corepack at runtime.
echo "Running Medusa migrations (no seed)..."
exec ./node_modules/.bin/medusa db:migrate
