#!/usr/bin/env bash
# Checks production after a deploy (T50); deploy.yml, rollback.yml and keepalive.yml run it.
#
#   scripts/smoke.sh                 # server + web
#   scripts/smoke.sh server          # /health on both functions: answers within 30 s, on this commit's contract
#   scripts/smoke.sh web             # /privacy answers 200 with this commit's policy version
#   scripts/smoke.sh migrations      # production's schema_version() is the newest file in supabase/migrations
#   scripts/smoke.sh wait-web <sha>  # waits (up to WAIT_WEB_SEC, default 900) until /version.txt is <sha>
#
# URLs and the anon key come from web/.env.production; SOLVER_URL, AGENT_URL, SITE_URL, SUPABASE_URL and
# SUPABASE_ANON_KEY override them, e.g. to check a local run.

set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$REPO/web/.env.production"

fail() { echo "FAIL: $*" >&2; exit 1; }

# The value of KEY in web/.env.production; empty when the line is missing or commented out.
setting() {
  [[ -f $ENV_FILE ]] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

need() { [[ -n $2 ]] || fail "$1 is not set (web/.env.production, or the $1 environment variable)"; }

SOLVER_URL=${SOLVER_URL:-$(setting VITE_SOLVER_URL)}
AGENT_URL=${AGENT_URL:-$(setting VITE_AGENT_URL)}
SITE_URL=${SITE_URL:-https://uselattice.app}
SUPABASE_URL=${SUPABASE_URL:-$(setting VITE_SUPABASE_URL)}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-$(setting VITE_SUPABASE_ANON_KEY)}

CONTRACT=$(sed -n 's/.*"version": *\([0-9]*\).*/\1/p' "$REPO/shared/contract.json")
POLICY=$(sed -n 's/^export const POLICY_VERSION = \([0-9]*\).*/\1/p' "$REPO/web/src/legal/policy.ts")
[[ -n $CONTRACT ]] || fail "no version in shared/contract.json"
[[ -n $POLICY ]] || fail "no POLICY_VERSION in web/src/legal/policy.ts"

# One function's /health: within 30 s, one retry, and on this commit's contract. The first start on a new image
# outruns Lambda's 10 s init limit, so Lambda starts it again inside the request: about 15 s (first deploy).
health() {
  local name=$1 url=${2%/} body=""
  for attempt in 1 2; do
    body=$(curl -sf --max-time 30 "$url/health") && break
    [[ $attempt == 1 ]] && echo "$name: no answer within 30 s, trying once more (cold start)"
  done
  [[ -n $body ]] || fail "$name: $url/health didn't answer"
  [[ $body =~ \"contract\":\ *([0-9]+) ]] || fail "$name: no contract in $body"
  [[ ${BASH_REMATCH[1]} == "$CONTRACT" ]] ||
    fail "$name: contract ${BASH_REMATCH[1]}, this commit's is $CONTRACT"
  echo "$name: $body"
}

check_server() {
  need SOLVER_URL "$SOLVER_URL"
  need AGENT_URL "$AGENT_URL"
  health solver "$SOLVER_URL"
  health agent "$AGENT_URL"
}

check_web() {
  local page
  page=$(curl -sf --max-time 20 "${SITE_URL%/}/privacy") || fail "$SITE_URL/privacy didn't answer 200"
  grep -q "Version $POLICY" <<<"$page" || fail "$SITE_URL/privacy doesn't show Version $POLICY"
  echo "web: $SITE_URL/privacy shows Version $POLICY"
}

check_migrations() {
  local newest applied key_headers=()
  need SUPABASE_URL "$SUPABASE_URL"
  need SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
  newest=$(find "$REPO/supabase/migrations" -name '*.sql' -printf '%f\n' | sort | tail -1 | cut -d_ -f1)
  # New-style keys go only in apikey; legacy JWT keys in Authorization too (server/supabase_env.py).
  key_headers=(-H "apikey: $SUPABASE_ANON_KEY")
  [[ $SUPABASE_ANON_KEY == eyJ* ]] && key_headers+=(-H "Authorization: Bearer $SUPABASE_ANON_KEY")
  applied=$(curl -sf --max-time 20 -X POST "${SUPABASE_URL%/}/rest/v1/rpc/schema_version" "${key_headers[@]}" \
    -H 'content-type: application/json' -d '{}') || fail "schema_version() didn't answer"
  applied=${applied//\"/}
  [[ $applied < $newest ]] && fail "production is at migration $applied, the newest is $newest: run scripts/migrate-prod.sh"
  echo "migrations: production is at $applied (newest file $newest)"
}

wait_web() {
  local sha=$1 deadline=$((SECONDS + ${WAIT_WEB_SEC:-900})) served=""
  [[ -n $sha ]] || fail "wait-web needs the commit SHA"
  until served=$(curl -sf --max-time 10 "${SITE_URL%/}/version.txt") && [[ $served == "$sha" ]]; do
    ((SECONDS < deadline)) || fail "$SITE_URL/version.txt is still '${served:-nothing}', not $sha"
    sleep 15
  done
  echo "web: $SITE_URL serves $sha"
}

case ${1:-all} in
  all) check_server; check_web ;;
  server) check_server ;;
  web) check_web ;;
  migrations) check_migrations ;;
  wait-web) wait_web "${2:-}" ;;
  *) fail "unknown check '$1' (all, server, web, migrations, wait-web <sha>)" ;;
esac
