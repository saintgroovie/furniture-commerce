#!/bin/sh
set -eu
# Corepack is enabled in the image build; do not re-run as non-root.
echo "Running Medusa migrations (no seed)..."
exec yarn medusa db:migrate
