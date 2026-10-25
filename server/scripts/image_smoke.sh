#!/usr/bin/env bash
# Smoke test for the server image (T47): build it, run it read-only as Lambda would, then check /health, a 10 s
# solve of the sample college with every session placed, and /agent refusing with "not configured" (no keys given).
# Prints the image size and the time from `podman run` to the first /health answer.
#
#   server/scripts/image_smoke.sh            # SMOKE_PORT=8081 to use another host port, SMOKE_TAG to name the image

set -euo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
TAG=${SMOKE_TAG:-lattice-server:smoke}
PORT=${SMOKE_PORT:-8080}
URL="http://127.0.0.1:$PORT"
NAME="lattice-smoke-$$"
FIXTURES="$REPO/shared/fixtures"

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== build $TAG"
podman build --platform linux/amd64 -t "$TAG" -f "$REPO/Dockerfile" "$REPO"
SIZE=$(podman image inspect --format '{{.Size}}' "$TAG")

echo "== run on port $PORT"
trap 'podman stop -t 2 "$NAME" >/dev/null 2>&1 || true' EXIT
start=$(date +%s%N)
podman run -d --rm --name "$NAME" --platform linux/amd64 --read-only --tmpfs /tmp -p "$PORT:8080" "$TAG" >/dev/null
for _ in $(seq 600); do
  curl -sf "$URL/health" >/dev/null && break
  podman container exists "$NAME" || fail "container exited before /health answered"
  sleep 0.1
done
curl -sf "$URL/health" >/dev/null || { podman logs "$NAME" >&2; fail "/health didn't answer within 60 s"; }
ready_ms=$(( ($(date +%s%N) - start) / 1000000 ))
echo "/health: $(curl -s "$URL/health")"

echo "== solve the sample college, 10 s limit"
body=$(python3 -c 'import json, sys
d = json.load(open(sys.argv[1])); d["options"]["timeLimitSec"] = 10; print(json.dumps(d))' "$FIXTURES/sample-college.json")
result=$(curl -sf -X POST "$URL/solve" -H 'content-type: application/json' --data-binary "$body") || fail "/solve"
python3 -c 'import json, sys
res = json.loads(sys.argv[1]); sessions = len(json.load(open(sys.argv[2])))
status, placed, unplaced = res["status"], len(res["placements"]), len(res["unplaced"])
assert status in ("optimal", "feasible"), (status, res.get("message"))
assert placed == sessions, f"{placed} of {sessions} sessions placed"
assert unplaced == 0, f"{unplaced} unplaced"
print(f"status {status}, {sessions} sessions placed, score", res["score"]["total"], "in", res["timeMs"], "ms")' \
  "$result" "$FIXTURES/sample-sessions.json" || fail "/solve result"

echo "== /agent without keys"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/agent")
reply=$(curl -s -X POST "$URL/agent")
[[ $code == 503 && $reply == '{"reason":"not_configured"}' ]] || fail "/agent answered $code $reply"
echo "$code $reply"

echo "== passed"
echo "image size: $((SIZE / 1000000)) MB"
echo "run to first /health: $ready_ms ms"
