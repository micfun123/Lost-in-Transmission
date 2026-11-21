#!/usr/bin/env bash
# Update to the latest main and rebuild the container. Run on the server.
set -euo pipefail

cd "$(dirname "$0")/.."
git fetch -q origin main
git checkout -q -B main origin/main
docker compose up -d --build
docker image prune -f
