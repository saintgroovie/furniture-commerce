#!/bin/sh
set -e
corepack enable
echo "Waiting for database..."
sleep 3
echo "Installing dependencies..."
YARN_HTTP_TIMEOUT=300000 yarn install
echo "Running database migrations..."
yarn medusa db:migrate --execute-all-links
yarn seed || echo "Seeding skipped or failed, continuing..."
echo "Starting Medusa development server..."
exec yarn dev
