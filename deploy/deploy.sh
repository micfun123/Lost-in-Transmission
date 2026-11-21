#!/usr/bin/env bash
# Pull the latest code and rebuild the container. Run on the server.
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f
