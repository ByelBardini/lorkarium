#!/usr/bin/env bash
# Smoke of the production image (docs/context/deploy.md): waits for the HEALTHCHECK of a running
# container and checks the API, the SPA, its fallback and the boot order in the log.
# Usage: infra/docker/smoke.sh <container> <base-url>   e.g. smoke.sh lorkarium-smoke http://localhost:3333
set -euo pipefail

container="$1"
base="$2"

fail() {
  echo "smoke failed: $1" >&2
  docker logs "$container" 2>&1 | tail -40 >&2
  exit 1
}

for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo gone)"
  [ "$status" = healthy ] && break
  [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = true ] || fail "container stopped ($status)"
  sleep 2
done
[ "$status" = healthy ] || fail "container never became healthy ($status)"

[ "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/health")" = 200 ] || fail "GET /api/health is not 200"
curl -sf "$base/" | grep -q '<div id="root">' || fail "GET / does not answer the client index.html"
curl -sf "$base/campaigns/x" | grep -q '<div id="root">' || fail "a deep link does not fall back to index.html"

log="$(docker logs "$container" 2>&1)"
migrated="$(grep -n 'migrations applied' <<<"$log" | head -1 | cut -d: -f1)"
listening="$(grep -n 'Server listening' <<<"$log" | head -1 | cut -d: -f1)"
[ -n "$migrated" ] && [ -n "$listening" ] && [ "$migrated" -lt "$listening" ] ||
  fail "the log must show 'migrations applied' before 'Server listening'"

echo "smoke passed: $base"
