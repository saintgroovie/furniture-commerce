#!/bin/sh
set -e
corepack enable
echo "Installing dependencies..."
YARN_HTTP_TIMEOUT=300000 yarn install
echo "Starting Next.js dev server..."
exec yarn dev
